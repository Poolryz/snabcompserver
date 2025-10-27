const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Invoice = sequelize.define(
  "Invoice",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    invoiceDate: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "invoice_date", // В БД будет invoice_date, в коде - invoiceDate
    },
    organization: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    invoiceNumber: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: "invoice_number",
    },
    amount: {
      type: DataTypes.STRING(50), // Храним как строку "15 000 ₽"
      allowNull: false,
    },
    paymentDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "payment_date",
    },
    responsible: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "invoices",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

module.exports = Invoice;
