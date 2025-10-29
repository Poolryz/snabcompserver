const express = require("express");
const cors = require("cors");
const multer = require("multer");

const path = require("path");
const fs = require("fs");

const { syncDatabase, Invoice } = require("./models");
const { saveFileWithStructure } = require("./utils/fileUtils");

// Настройка multer для обработки файлов
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB лимит
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Разрешены только PDF файлы"), false);
    }
  },
});

// Создаем экземпляр приложения
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware CORS
app.use(cors());

// Middleware для парсинга JSON
app.use(express.json());

// Middleware для парсинга URL-encoded данных
app.use(express.urlencoded({ extended: true }));

// Middleware для загрузки файлов
const uploadFiles = upload.fields([
  { name: "invoicePdf", maxCount: 1 },
  { name: "paymentPdf", maxCount: 1 },
]);

// Инициализация базы данных при запуске
syncDatabase();

// Базовый маршрут для проверки
app.get("/", (req, res) => {
  res.json({
    message: "Сервер работает с PostgreSQL!",
    timestamp: new Date().toISOString(),
  });
});

//Запрос всех счетов.
app.get("/api/invoices", async (req, res) => {
  try {
    const invoices = await Invoice.findAll({
      order: [["invoiceDate", "DESC"]],
    });

    // Преобразуем даты в нужный формат для фронтенда
    const formattedInvoices = invoices.map((invoice) => ({
      id: invoice.id,
      invoiceDate: formatDateForFrontend(invoice.invoiceDate),
      organization: invoice.organization,
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.amount,
      paymentDate: formatDateForFrontend(invoice.paymentDate),
      responsible: invoice.responsible,
      note: invoice.note,
      // Добавляем ссылки на файлы
      invoicePdfUrl: invoice.invoicePdfPath
        ? `/api/files/${encodeURIComponent(invoice.invoicePdfPath)}`
        : null,
      paymentPdfUrl: invoice.paymentPdfPath
        ? `/api/files/${encodeURIComponent(invoice.paymentPdfPath)}`
        : null,
      // Также можно отправить оригинальные названия файлов для отображения
      invoicePdfName: invoice.invoicePdfPath
        ? getFileNameFromPath(invoice.invoicePdfPath)
        : null,
      paymentPdfName: invoice.paymentPdfPath
        ? getFileNameFromPath(invoice.paymentPdfPath)
        : null,
    }));

    res.json(formattedInvoices);
  } catch (error) {
    console.error("Ошибка:", error);
    res.status(500).json({ error: "Ошибка при получении счетов" });
  }
});

// Вспомогательная функция для получения имени файла из пути
function getFileNameFromPath(filePath) {
  return filePath ? filePath.split("/").pop() : null;
}

// GET - Получить файл
app.get("/api/files/:filePath", async (req, res) => {
  try {
    const filePath = req.params.filePath;

    if (!filePath) {
      return res.status(400).json({ error: "Не указан путь к файлу" });
    }

    // Декодируем путь
    const decodedFilePath = decodeURIComponent(filePath);
    const fullPath = path.join(process.cwd(), decodedFilePath);

    // Проверяем существование файла
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: "Файл не найден" });
    }

    // Проверяем, что файл находится в разрешенной директории
    if (!fullPath.startsWith(path.join(process.cwd(), "uploads"))) {
      return res.status(403).json({ error: "Доступ запрещен" });
    }

    // Получаем статистику файла
    const stats = fs.statSync(fullPath);
    if (!stats.isFile()) {
      return res
        .status(400)
        .json({ error: "Указанный путь не является файлом" });
    }

    // Правильные заголовки для PDF
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="document.pdf"');
    res.setHeader("Content-Length", stats.size);
    res.setHeader("Cache-Control", "public, max-age=3600");

    // Читаем и отправляем файл
    const fileStream = fs.createReadStream(fullPath);

    fileStream.on("error", (error) => {
      console.error("Ошибка чтения файла:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Ошибка при чтении файла" });
      }
    });

    fileStream.pipe(res);
  } catch (error) {
    console.error("Ошибка получения файла:", error);

    if (error.code === "ENOENT") {
      return res.status(404).json({ error: "Файл не найден" });
    }

    res.status(500).json({ error: "Ошибка при получении файла" });
  }
});

// GET - Получить счет по ID
app.get("/api/invoices/:id", async (req, res) => {
  try {
    const invoice = await Invoice.findByPk(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: "Счет не найден" });
    }

    const formattedInvoice = {
      id: invoice.id,
      invoiceDate: formatDateForFrontend(invoice.invoiceDate),
      organization: invoice.organization,
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.amount,
      paymentDate: formatDateForFrontend(invoice.paymentDate),
      responsible: invoice.responsible,
      note: invoice.note,
    };

    res.json(formattedInvoice);
  } catch (error) {
    res.status(500).json({ error: "Ошибка при получении счета" });
  }
});

// POST - Создать новый счет с файлами
app.post("/api/invoices", uploadFiles, async (req, res) => {
  try {
    const {
      invoiceDate,
      organization,
      invoiceNumber,
      amount,
      paymentDate,
      responsible,
      note,
    } = req.body;

    // Валидация
    if (!invoiceDate || !organization || !invoiceNumber || !amount) {
      return res.status(400).json({
        error:
          "Обязательные поля: invoiceDate, organization, invoiceNumber, amount",
      });
    }

    // Дополнительная валидация данных
    if (isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({
        error: "Сумма должна быть положительным числом",
      });
    }

    let invoicePdfPath = null;
    let paymentPdfPath = null;

    // Сохраняем файл счета если он есть
    if (req.files && req.files.invoicePdf) {
      invoicePdfPath = await saveFileWithStructure(
        req.files.invoicePdf[0],
        invoiceDate,
        organization,
        "счет"
      );
    }

    // Сохраняем файл платежки если он есть
    if (req.files && req.files.paymentPdf) {
      paymentPdfPath = await saveFileWithStructure(
        req.files.paymentPdf[0],
        paymentDate || invoiceDate, // Если дата платежа не указана, используем дату счета
        organization,
        "платежка"
      );
    }

    const invoice = await Invoice.create({
      invoiceDate: parseDateFromFrontend(invoiceDate),
      organization,
      invoiceNumber,
      amount: Number(amount),
      paymentDate: paymentDate ? parseDateFromFrontend(paymentDate) : null,
      responsible,
      note,
      invoicePdfPath,
      paymentPdfPath,
    });

    res.status(201).json({
      id: invoice.id,
      invoiceDate: formatDateForFrontend(invoice.invoiceDate),
      organization: invoice.organization,
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.amount,
      paymentDate: formatDateForFrontend(invoice.paymentDate),
      responsible: invoice.responsible,
      note: invoice.note,
      invoicePdfPath: invoice.invoicePdfPath,
      paymentPdfPath: invoice.paymentPdfPath,
    });
  } catch (error) {
    console.error("Ошибка создания счета:", error);

    if (error.name === "SequelizeValidationError") {
      return res.status(400).json({
        error: "Ошибка валидации данных",
        details: error.errors.map((err) => err.message),
      });
    }

    // Обработка ошибок multer
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res
          .status(400)
          .json({ error: "Размер файла не должен превышать 10MB" });
      }
    }

    res.status(500).json({ error: "Ошибка при создании счета" });
  }
});

// PATCH - Обновить счет
// PATCH - Обновить счет
app.patch("/api/invoices/:id", uploadFiles, async (req, res) => {
  try {
    const invoice = await Invoice.findByPk(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: "Счет не найден" });
    }

    // Для отладки - логируем что приходит
    console.log("req.body:", req.body);
    console.log("req.files:", req.files);

    // Подготавливаем данные для обновления
    const updateData = {};

    // Явно копируем только нужные поля
    const allowedFields = [
      "invoiceDate",
      "organization",
      "invoiceNumber",
      "amount",
      "paymentDate",
      "responsible",
      "note",
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    // Преобразуем даты если они пришли
    if (updateData.invoiceDate) {
      updateData.invoiceDate = parseDateFromFrontend(updateData.invoiceDate);
    }
    if (updateData.paymentDate) {
      updateData.paymentDate = parseDateFromFrontend(updateData.paymentDate);
    }

    // Функция для обработки обновления файла
    const handleFileUpdate = async (
      fileField,
      fileType,
      currentFilePath,
      dateField,
      organizationField
    ) => {
      if (req.files && req.files[fileField]) {
        // Загружен новый файл
        const file = req.files[fileField][0];

        // Определяем данные для создания структуры папок
        const fileDate = req.body[dateField] || invoice[dateField];
        const fileOrganization =
          req.body[organizationField] || invoice[organizationField];

        // Удаляем старый файл если он существует
        if (currentFilePath) {
          try {
            const oldFilePath = path.join(process.cwd(), currentFilePath);
            if (fs.existsSync(oldFilePath)) {
              fs.unlinkSync(oldFilePath);
              console.log(`Старый файл ${fileType} удален: ${currentFilePath}`);
            }
          } catch (fileError) {
            console.error(
              `Ошибка удаления старого файла ${fileType}:`,
              fileError
            );
          }
        }

        // Сохраняем новый файл с правильной структурой папок
        const newFilePath = await saveFileWithStructure(
          file,
          fileDate,
          fileOrganization,
          fileType
        );

        return newFilePath;
      } else if (
        currentFilePath &&
        (req.body[dateField] || req.body[organizationField])
      ) {
        // Файл не загружен, но изменились связанные поля (дата или организация)
        // Нужно переместить и переименовать существующий файл

        const newDate = req.body[dateField] || invoice[dateField];
        const newOrganization =
          req.body[organizationField] || invoice[organizationField];

        // Создаем новый путь на основе обновленных данных
        const newFilePath = await moveFileToNewStructure(
          currentFilePath,
          newDate,
          newOrganization,
          fileType
        );

        return newFilePath;
      }

      return currentFilePath; // Возвращаем текущий путь если файл не обновлялся
    };

    // Функция для перемещения существующего файла в новую структуру
    const moveFileToNewStructure = async (
      currentFilePath,
      newDate,
      newOrganization,
      fileType
    ) => {
      try {
        const oldFullPath = path.join(process.cwd(), currentFilePath);

        // Проверяем существует ли старый файл
        if (!fs.existsSync(oldFullPath)) {
          console.log(
            `Файл не существует, пропускаем перемещение: ${currentFilePath}`
          );
          return currentFilePath;
        }

        // Создаем временный файл из старого для использования saveFileWithStructure
        const tempFile = {
          buffer: fs.readFileSync(oldFullPath),
          originalname: path.basename(currentFilePath),
          mimetype: "application/pdf",
        };

        // Сохраняем файл в новой структуре
        const newFilePath = await saveFileWithStructure(
          tempFile,
          newDate,
          newOrganization,
          fileType
        );

        // Удаляем старый файл после успешного сохранения нового
        fs.unlinkSync(oldFullPath);
        console.log(`Файл перемещен из ${currentFilePath} в ${newFilePath}`);

        return newFilePath;
      } catch (error) {
        console.error(`Ошибка перемещения файла ${currentFilePath}:`, error);
        return currentFilePath; // В случае ошибки возвращаем старый путь
      }
    };

    // Обрабатываем обновление файла счета
    updateData.invoicePdfPath = await handleFileUpdate(
      "invoicePdf",
      "счет",
      invoice.invoicePdfPath,
      "invoiceDate",
      "organization"
    );

    // Обрабатываем обновление файла платежки
    updateData.paymentPdfPath = await handleFileUpdate(
      "paymentPdf",
      "платежка",
      invoice.paymentPdfPath,
      "paymentDate",
      "organization"
    );

    // Также обрабатываем случай, когда файл платежки существует, но paymentDate был null
    // и теперь установлен, или наоборот
    if (
      !req.files?.paymentPdf &&
      invoice.paymentPdfPath &&
      req.body.paymentDate
    ) {
      const newPaymentDate = parseDateFromFrontend(req.body.paymentDate);
      const currentPaymentDate = invoice.paymentDate;

      // Если дата платежа изменилась с null на значение или наоборот
      if (
        (!currentPaymentDate && newPaymentDate) ||
        (currentPaymentDate && !newPaymentDate)
      ) {
        updateData.paymentPdfPath = await moveFileToNewStructure(
          invoice.paymentPdfPath,
          req.body.paymentDate || invoice.invoiceDate,
          req.body.organization || invoice.organization,
          "платежка"
        );
      }
    }

    // Логируем что будем обновлять
    console.log("Данные для обновления:", updateData);

    // Обновляем запись
    await invoice.update(updateData);

    // Перезагружаем обновленную запись
    await invoice.reload();

    // Возвращаем отформатированный ответ с ссылками на файлы
    const formattedInvoice = {
      id: invoice.id,
      invoiceDate: formatDateForFrontend(invoice.invoiceDate),
      organization: invoice.organization,
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.amount,
      paymentDate: formatDateForFrontend(invoice.paymentDate),
      responsible: invoice.responsible,
      note: invoice.note,
      invoicePdfUrl: invoice.invoicePdfPath
        ? `/api/files/${encodeURIComponent(invoice.invoicePdfPath)}`
        : null,
      paymentPdfUrl: invoice.paymentPdfPath
        ? `/api/files/${encodeURIComponent(invoice.paymentPdfPath)}`
        : null,
      invoicePdfName: invoice.invoicePdfPath
        ? invoice.invoicePdfPath.split("/").pop()
        : null,
      paymentPdfName: invoice.paymentPdfPath
        ? invoice.paymentPdfPath.split("/").pop()
        : null,
    };

    res.json(formattedInvoice);
  } catch (error) {
    console.error("Ошибка обновления счета:", error);

    if (error.name === "SequelizeValidationError") {
      return res.status(400).json({
        error: "Ошибка валидации данных",
        details: error.errors.map((err) => err.message),
      });
    }

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res
          .status(400)
          .json({ error: "Размер файла не должен превышать 10MB" });
      }
    }

    res.status(500).json({ error: "Ошибка при обновлении счета" });
  }
});

// DELETE - Удалить счет
app.delete("/api/invoices/:id", async (req, res) => {
  try {
    const invoice = await Invoice.findByPk(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: "Счет не найден" });
    }

    const invoicePdfPath = invoice.invoicePdfPath;
    const paymentPdfPath = invoice.paymentPdfPath;

    // Удаляем запись из базы данных
    await invoice.destroy();

    // Функция для безопасного удаления файла
    const safeDeleteFile = async (filePath) => {
      if (!filePath) return;

      try {
        const fullPath = path.join(process.cwd(), filePath);

        // Проверяем существование файла перед удалением
        try {
          await fs.promises.access(fullPath);
        } catch {
          console.log(`Файл не существует, пропускаем: ${filePath}`);
          return;
        }

        await fs.promises.unlink(fullPath);
        console.log(`Файл успешно удален: ${filePath}`);
      } catch (error) {
        console.error(`Ошибка удаления файла ${filePath}:`, error);
        // Продолжаем выполнение даже при ошибке удаления файла
      }
    };

    // Удаляем файлы асинхронно
    await Promise.allSettled([
      safeDeleteFile(invoicePdfPath),
      safeDeleteFile(paymentPdfPath),
    ]);

    res.json({ message: "Счет удален" });
  } catch (error) {
    console.error("Ошибка удаления счета:", error);
    res.status(500).json({ error: "Ошибка при удалении счета" });
  }
});

// Вспомогательные функции для работы с датами
function formatDateForFrontend(date) {
  if (!date) return null;
  return new Date(date).toISOString().split("T")[0]; // "2024-01-15"
}

function parseDateFromFrontend(dateString) {
  if (!dateString) return null;
  return new Date(dateString);
}

// Обработка 404 ошибки
app.use((req, res) => {
  res.status(404).json({
    error: "Маршрут не найден",
    path: req.originalUrl,
    method: req.method,
  });
});

// Базовая обработка ошибок
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "Внутренняя ошибка сервера",
  });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📍 Доступен по адресу: http://localhost:${PORT}`);
});
