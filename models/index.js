const { sequelize, testConnection } = require("../config/database");
const Invoice = require("./Invoice");

// Синхронизация с БД (создание таблиц если их нет)
const syncDatabase = async () => {
  try {
    await testConnection();
    await sequelize.sync({ force: false }); // force: true - пересоздает таблицы
    console.log("✅ Модели синхронизированы с БД");
  } catch (error) {
    console.error("❌ Ошибка синхронизации БД:", error);
  }
};

module.exports = {
  sequelize,
  Invoice,
  syncDatabase,
};
