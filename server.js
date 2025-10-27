const express = require("express");
const cors = require("cors");
const { syncDatabase, Invoice } = require("./models"); // Добавь эту строку

// Создаем экземпляр приложения
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware CORS
app.use(cors());

// Middleware для парсинга JSON
app.use(express.json());

// Middleware для парсинга URL-encoded данных
app.use(express.urlencoded({ extended: true }));

// Инициализация базы данных при запуске
syncDatabase(); // Добавь эту строку

// Базовый маршрут для проверки
app.get("/", (req, res) => {
  res.json({
    message: "Сервер работает с PostgreSQL!",
    timestamp: new Date().toISOString(),
  });
});

// GET - Получить все счета
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
    }));

    res.json(formattedInvoices);
  } catch (error) {
    console.error("Ошибка:", error);
    res.status(500).json({ error: "Ошибка при получении счетов" });
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

// POST - Создать новый счет
app.post("/api/invoices", async (req, res) => {
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

    const invoice = await Invoice.create({
      invoiceDate: parseDateFromFrontend(invoiceDate),
      organization,
      invoiceNumber,
      amount: Number(amount),
      paymentDate: paymentDate ? parseDateFromFrontend(paymentDate) : null,
      responsible,
      note,
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
    });
  } catch (error) {
    console.error("Ошибка создания счета:", error);

    if (error.name === "SequelizeValidationError") {
      return res.status(400).json({
        error: "Ошибка валидации данных",
        details: error.errors.map((err) => err.message),
      });
    }

    res.status(500).json({ error: "Ошибка при создании счета" });
  }
});

// PUT - Обновить счет
app.put("/api/invoices/:id", async (req, res) => {
  try {
    const invoice = await Invoice.findByPk(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: "Счет не найден" });
    }

    // Подготавливаем данные для обновления
    const updateData = { ...req.body };

    // Преобразуем даты если они пришли
    if (updateData.invoiceDate) {
      updateData.invoiceDate = parseDateFromFrontend(updateData.invoiceDate);
    }
    if (updateData.paymentDate) {
      updateData.paymentDate = parseDateFromFrontend(updateData.paymentDate);
    }

    await invoice.update(updateData);

    // Возвращаем отформатированный ответ
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

    await invoice.destroy();
    res.json({ message: "Счет удален" });
  } catch (error) {
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
