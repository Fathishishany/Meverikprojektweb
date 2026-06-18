/**
 * db.js
 * ----------------------------------------------------------------------
 * Unsere "Datenbank" fuer dieses Projekt.
 * ----------------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const DATA_FILE = path.join(__dirname, "data.json");

function loadData() {
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  return JSON.parse(raw);
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

let state = loadData();

if (!state.admins || state.admins.length === 0) {
  const defaultPassword = "admin123";
  state.admins = [
    {
      id: 1,
      username: "admin",
      passwordHash: bcrypt.hashSync(defaultPassword, 10),
    },
  ];
  saveData(state);
  console.log(
    `[db] Kein Admin gefunden - Standard-Account angelegt: ` +
      `username="admin" passwort="${defaultPassword}" (bitte spaeter aendern!)`
  );
}

if (!state.customers) {
  state.customers = [];
  saveData(state);
}

function getAllTickets() {
  return state.tickets;
}

function getTicketById(id) {
  return state.tickets.find((t) => t.id === id);
}

function createTicket(ticketData) {
  const nextNumber = state.nextTicketNumber || 1000;
  const id = `MV-${nextNumber}`;
  state.nextTicketNumber = nextNumber + 1;

  const ticket = {
    id,
    customerName: ticketData.customerName,
    email: ticketData.email,
    businessName: ticketData.businessName,
    packageId: ticketData.packageId,
    message: ticketData.message || "",
    status: "new",
    country: ticketData.country || "Unbekannt",
    qrCodeDataUrl: ticketData.qrCodeDataUrl || null,
    customerId: ticketData.customerId || null,
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  state.tickets.push(ticket);
  saveData(state);
  return ticket;
}

function replaceTicket(id, fullData) {
  const idx = state.tickets.findIndex((t) => t.id === id);
  if (idx === -1) return null;

  const existing = state.tickets[idx];
  const updated = {
    ...existing,
    customerName: fullData.customerName,
    email: fullData.email,
    businessName: fullData.businessName,
    packageId: fullData.packageId,
    message: fullData.message,
    status: fullData.status,
    country: fullData.country,
    updatedAt: new Date().toISOString(),
  };

  state.tickets[idx] = updated;
  saveData(state);
  return updated;
}

function patchTicket(id, partialData) {
  const idx = state.tickets.findIndex((t) => t.id === id);
  if (idx === -1) return null;

  state.tickets[idx] = {
    ...state.tickets[idx],
    ...partialData,
    updatedAt: new Date().toISOString(),
  };

  saveData(state);
  return state.tickets[idx];
}

function deleteTicket(id) {
  const idx = state.tickets.findIndex((t) => t.id === id);
  if (idx === -1) return false;
  state.tickets.splice(idx, 1);
  saveData(state);
  return true;
}

function getTicketsByCustomerId(customerId) {
  return state.tickets.filter((t) => t.customerId === customerId);
}

function addMessageToTicket(id, message) {
  const idx = state.tickets.findIndex((t) => t.id === id);
  if (idx === -1) return null;

  if (!state.tickets[idx].messages) {
    state.tickets[idx].messages = [];
  }
  state.tickets[idx].messages.push(message);
  state.tickets[idx].updatedAt = new Date().toISOString();

  saveData(state);
  return state.tickets[idx];
}

function getAllPackages() {
  return state.packages;
}

function getPackageById(id) {
  return state.packages.find((p) => p.id === id);
}

function findAdminByUsername(username) {
  return state.admins.find((a) => a.username === username);
}

function findCustomerByEmail(email) {
  return state.customers.find((c) => c.email.toLowerCase() === (email || "").toLowerCase());
}

function createCustomer({ name, email, passwordHash }) {
  const id = state.customers.length > 0 ? Math.max(...state.customers.map((c) => c.id)) + 1 : 1;
  const customer = { id, name, email, passwordHash };
  state.customers.push(customer);
  saveData(state);
  return customer;
}

module.exports = {
  getAllTickets,
  getTicketById,
  createTicket,
  replaceTicket,
  patchTicket,
  deleteTicket,
  getTicketsByCustomerId,
  addMessageToTicket,
  getAllPackages,
  getPackageById,
  findAdminByUsername,
  findCustomerByEmail,
  createCustomer,
};