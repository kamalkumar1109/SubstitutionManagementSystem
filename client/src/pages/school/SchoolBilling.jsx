import React, { useEffect, useState } from "react";
import { apiRequest } from "../../utils/apiClient";
import { Flash, Notice, PageHead } from "../../components/app/Ui.jsx";

function formatWhen(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatPlanPrice(plan) {
  if (plan?.amount == null || plan.amount === "") return "Price not configured";
  return `${plan.currency || ""} ${Number(plan.amount).toLocaleString("en-IN")}`.trim();
}

function loadRazorpay() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) {
      resolve(window.Razorpay);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(window.Razorpay);
    script.onerror = () => reject(new Error("Unable to load Razorpay Checkout."));
    document.body.appendChild(script);
  });
}

export default function SchoolBilling() {
  const [billing, setBilling] = useState(null);
  const [plans, setPlans] = useState([]);
  const [planId, setPlanId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const [current, catalogue] = await Promise.all([
      apiRequest("/api/billing/current"),
      apiRequest("/api/billing/plans")
    ]);
    setBilling(current);
    const nextPlans = catalogue.plans || [];
    setPlans(nextPlans);
    const currentPlanId = current.subscription?.planId;
    setPlanId((prev) => prev || currentPlanId || nextPlans[0]?._id || "");
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await load();
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const sub = billing?.subscription;
  const selected = plans.find((p) => String(p._id) === String(planId));

  async function startCheckout() {
    if (!planId) {
      setError("Select a plan configured for this school.");
      return;
    }
    setBusy(true);
    setError("");
    let paymentId = "";
    try {
      const data = await apiRequest("/api/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ planId })
      });
      const session = data.checkout;
      paymentId = session.paymentId;
      if (!session.keyId) {
        throw new Error("Razorpay is not configured. Add test keys on the server to take payments.");
      }
      const Razorpay = await loadRazorpay();
      await new Promise((resolve, reject) => {
        const checkout = new Razorpay({
          key: session.keyId,
          amount: session.amountPaise,
          currency: session.currency,
          name: session.name,
          description: session.description,
          order_id: session.orderId,
          prefill: session.prefill,
          handler: async (response) => {
            try {
              await apiRequest("/api/billing/verify", {
                method: "POST",
                body: JSON.stringify({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature
                })
              });
              resolve();
            } catch (err) {
              reject(err);
            }
          },
          modal: {
            ondismiss: async () => {
              try {
                await apiRequest("/api/billing/checkout/cancel", {
                  method: "POST",
                  body: JSON.stringify({ paymentId })
                });
              } catch {
                /* keep going */
              }
              reject(new Error("Payment was cancelled."));
            }
          }
        });
        checkout.open();
      });
      await load();
      setFlash("Payment verified. The subscription is now active for this school.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead eyebrow="Billing" title="Subscription">
        <p>Plan amounts come from the server catalogue. This screen does not hardcode prices.</p>
      </PageHead>
      <Flash message={flash} />
      <Notice loading={loading} error={error} />
      {billing && !loading ? (
        <>
          <section className="app-panel">
            <h2 className="app-h2">Current plan</h2>
            <dl className="app-dl">
              <div>
                <dt>Current plan</dt>
                <dd>{sub?.plan?.name || "No plan selected"}</dd>
              </div>
              <div>
                <dt>Subscription status</dt>
                <dd>{sub?.status || "NONE"}</dd>
              </div>
              <div>
                <dt>Start date</dt>
                <dd>{formatWhen(sub?.startDate)}</dd>
              </div>
              <div>
                <dt>Expiry date</dt>
                <dd>{formatWhen(sub?.expiryDate)}</dd>
              </div>
              <div>
                <dt>Billing cycle</dt>
                <dd>{sub?.billingCycle || "—"}</dd>
              </div>
              <div>
                <dt>Payment status</dt>
                <dd>{sub?.paymentStatus || "—"}</dd>
              </div>
            </dl>
          </section>

          <section className="app-panel">
            <h2 className="app-h2">Renew subscription</h2>
            {plans.length === 0 ? (
              <p className="app-muted">No subscription plans have been configured yet.</p>
            ) : (
              <>
                <div className="app-plan-grid">
                  {plans.map((plan) => (
                    <label
                      key={plan._id}
                      className={`app-plan-card${String(planId) === String(plan._id) ? " is-selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="plan"
                        value={plan._id}
                        checked={String(planId) === String(plan._id)}
                        onChange={() => setPlanId(plan._id)}
                      />
                      <strong>{plan.name}</strong>
                      <span>{plan.billingCycle === "YEARLY" ? "Yearly" : "Monthly"}</span>
                      <span>{formatPlanPrice(plan)}</span>
                      {plan.description ? <p>{plan.description}</p> : null}
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  className="site-btn site-btn-primary"
                  onClick={startCheckout}
                  disabled={busy || !selected}
                >
                  {busy ? "Opening payment…" : "Renew Subscription"}
                </button>
                {!billing.gateway?.configured && !billing.gateway?.keyId ? (
                  <p className="app-muted">Razorpay test keys have not been added to the server environment yet.</p>
                ) : null}
              </>
            )}
          </section>
        </>
      ) : null}
    </>
  );
}
