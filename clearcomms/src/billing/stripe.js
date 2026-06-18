"use strict";
const config = require("../config");
const repo = require("../db/repo");

let stripe = null;
function getStripe() {
  if (!config.stripe.enabled) return null;
  if (!stripe) stripe = require("stripe")(config.stripe.secretKey);
  return stripe;
}

async function ensureCustomer(org, email) {
  const s = getStripe();
  if (!s) throw new Error("Billing not configured");
  if (org.stripe_customer_id) return org.stripe_customer_id;
  const customer = await s.customers.create({ name: org.name, email, metadata: { orgId: org.id } });
  repo.setOrgCustomer(org.id, customer.id);
  return customer.id;
}

async function createCheckout(org, email) {
  const s = getStripe();
  if (!s) throw new Error("Billing not configured");
  if (!config.stripe.priceId) throw new Error("STRIPE_PRICE_ID is not set");
  const customer = await ensureCustomer(org, email);
  const session = await s.checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price: config.stripe.priceId, quantity: 1 }],
    success_url: config.appUrl + "/app?billing=success",
    cancel_url: config.appUrl + "/app?billing=cancelled",
    allow_promotion_codes: true,
  });
  return session.url;
}

async function createPortal(org) {
  const s = getStripe();
  if (!s) throw new Error("Billing not configured");
  if (!org.stripe_customer_id) throw new Error("No billing account yet");
  const session = await s.billingPortal.sessions.create({ customer: org.stripe_customer_id, return_url: config.appUrl + "/app" });
  return session.url;
}

function constructEvent(rawBody, sig) {
  const s = getStripe();
  if (!s) throw new Error("Billing not configured");
  return s.webhooks.constructEvent(rawBody, sig, config.stripe.webhookSecret);
}

/** Apply a Stripe subscription event to the matching org. */
function applyEvent(event) {
  const obj = event && event.data && event.data.object;
  if (!obj || !obj.customer) return;
  const org = repo.getOrgByCustomer(obj.customer);
  if (!org) return;
  switch (event.type) {
    case "checkout.session.completed":
      repo.setOrgSubscription(org.id, "pro", "active", obj.subscription || null);
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const status = obj.status;
      const active = status === "active" || status === "trialing";
      repo.setOrgSubscription(org.id, active ? "pro" : "free", status, obj.id);
      break;
    }
    case "customer.subscription.deleted":
      repo.setOrgSubscription(org.id, "free", "canceled", obj.id);
      break;
    default:
      break;
  }
}

module.exports = { getStripe, ensureCustomer, createCheckout, createPortal, constructEvent, applyEvent };
