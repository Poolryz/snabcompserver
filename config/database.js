const { Sequelize } = require("sequelize");

// Настройки подключения к БД
const sequelize = new Sequelize(
  process.env.DB_NAME || "snabcomp", // имя БД
  process.env.DB_USER || "postgres", // пользователь
  process.env.DB_PASSWORD || "120698da", // пароль
  {
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT || 5432,
    dialect: "postgres",
    logging: process.env.NODE_ENV === "development" ? console.log : false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  }
);

// Проверка подключения
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log("✅ Подключение к PostgreSQL установлено");
  } catch (error) {
    console.error("❌ Ошибка подключения к БД:", error.message);
  }
};

module.exports = { sequelize, testConnection };
