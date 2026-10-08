import { useCallback, useEffect, useState } from "react";
import { ApiError, request } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Modal,
  Skeleton,
  StatusPill,
} from "@/components/ui/kit";
import { ReceiptIcon } from "@/components/ui/doodles";

type Plan = {
  id: string;
  label: string;
  amountPaise: number;
  credits: number;
  description: string;
  priceInRupees?: number;
};

type Payment = {
  id: number;
  credits_added: number;
  amount_paid: number;
  status: string;
  created_at: string;
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Derived, never stored twice: the pack price divided by its credits. One
 * credit buys one new video, so this is the price of a fresh notebook.
 */
function perCredit(plan: Plan): string {
  const rupees = plan.priceInRupees ?? plan.amountPaise / 100;
  return (rupees / plan.credits).toFixed(2);
}

/**
 * Credits page.
 *
 * The three prepaid plans come from the API (`/payments/plans`) so the page and
 * the server can never disagree. Buying a plan still uses the same order
 * endpoint as before; the only change is that Razorpay's checkout now opens over
 * this page instead of in a popup window, and the balance in the header
 * refreshes once the payment goes through.
 */
export function PaymentsPage({
  onToast,
}: {
  onToast: (message: string, tone: "info" | "error" | "success") => void;
}) {
  const { user, refreshUser } = useAuth();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [purchases, setPurchases] = useState<Payment[]>([]);
  const [purchasesFailed, setPurchasesFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);

  const loadPlans = useCallback(async () => {
    setError(null);
    setLoading(true);

    try {
      const response = await request<{ plans: Plan[] }>("/payments/plans", {
        auth: false,
      });
      setPlans(response.plans);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load the credit packs.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPurchases = useCallback(async () => {
    try {
      const response = await request<{ payments: Payment[] }>("/payments/my");
      setPurchases(response.payments ?? []);
      setPurchasesFailed(false);
    } catch {
      // Optional section: when the server cannot answer we say so instead of
      // claiming the reader has never bought anything.
      setPurchasesFailed(true);
    }
  }, []);

  useEffect(() => {
    void loadPlans();
    void loadPurchases();
  }, [loadPlans, loadPurchases]);

  async function confirmPayment(id: number) {
    try {
      await request(`/payments/${id}/verify`, { method: "POST" });
      onToast("Payment received — your credits are on the account.", "success");
    } catch {
      onToast(
        "Payment received. Your credits appear here once the payment is confirmed.",
        "info",
      );
    } finally {
      void refreshUser().catch(() => undefined);
      void loadPurchases();
    }
  }

  async function startCheckout(plan: Plan) {
    setBusyPlan(plan.id);

    try {
      const { order, paymentId } = await request<{
        order: { id: string; amount: number; currency: string; key: string };
        paymentId: number;
      }>("/payments", { method: "POST", body: { planId: plan.id }, auth: true });

      const Razorpay = window.Razorpay;

      if (!Razorpay) {
        onToast(
          "The payment window could not be loaded. Check your connection and try again.",
          "error",
        );
        return;
      }

      const checkout = new Razorpay({
        key: order.key,
        amount: order.amount,
        currency: order.currency,
        name: "StudyScribe",
        description: `${plan.credits} notes credits`,
        order_id: order.id,
        theme: { color: "#7b5cff" },
        handler: () => {
          // Confirm on the server straight away: a webhook cannot reach a
          // laptop, and the endpoint checks the payment with Razorpay before
          // any credit is added, so this is safe to call from the browser.
          void confirmPayment(paymentId);
        },
      });

      checkout.open();
    } catch (caught) {
      // A 5xx means payments are down on our side, not something the reader
      // typed — say so plainly instead of echoing a server error string.
      // 503 means the server has no payment credentials — technical, and not
      // something the reader can act on, so it gets the same plain copy as 5xx.
      const friendly =
        caught instanceof ApiError &&
        caught.status < 500 &&
        caught.status !== 503
          ? caught.message
          : "The checkout could not be started — payments look unavailable right now. Try again in a moment.";

      onToast(friendly, "error");
    } finally {
      setBusyPlan(null);
    }
  }

  const credits = user?.credits ?? 0;

  return (
    <div className="stack stack-lg">
      <header className="page-head">
        <div>
          <h1>Credits</h1>
          <p className="muted no-margin">
            You have {credits} credit{credits === 1 ? "" : "s"} · 1 credit per new
            video · re-running the same video is free
          </p>
        </div>

        <Button variant="white" onClick={() => setExplainOpen(true)}>
          How credits work
        </Button>
      </header>

      {error ? (
        <Alert>
          {error} <Button size="sm" variant="white" onClick={() => void loadPlans()}>
            Try again
          </Button>
        </Alert>
      ) : null}

      {loading && plans.length === 0 ? (
        <Skeleton count={3} />
      ) : (
        <section className="plans">
          {plans.map((plan, index) => (
            <article
              className={`plan${index === 1 ? " featured" : ""}`}
              key={plan.id}
            >
              <div className="row-between">
                <span className="amount">
                  ₹{plan.priceInRupees ?? plan.amountPaise / 100}
                </span>
                {index === 1 ? <Badge tone="pink">Most popular</Badge> : null}
              </div>

              <p className="credits no-margin">
                {plan.label} — {plan.credits} credits
              </p>
              <p className="plan-lines no-margin">
                ₹{perCredit(plan)} per video
              </p>

              <ul>
                <li>• 1 credit per new video</li>
                <li>• Re-running the same video is free</li>
                <li>• Credits stay on your account</li>
              </ul>

              <Button
                variant={index === 1 ? "ink" : "white"}
                onClick={() => void startCheckout(plan)}
                disabled={busyPlan !== null}
              >
                {busyPlan === plan.id
                  ? "Opening checkout…"
                  : `Buy ${plan.credits} credits`}
              </Button>
            </article>
          ))}
        </section>
      )}

      <section>
        <div className="page-head">
          <h2>Past purchases</h2>
        </div>

        {purchasesFailed ? (
          <Alert tone="info">
            Your past purchases could not be loaded right now.{" "}
            <Button
              size="sm"
              variant="white"
              onClick={() => void loadPurchases()}
            >
              Try again
            </Button>
          </Alert>
        ) : purchases.length === 0 ? (
          <EmptyState
            title="No purchases yet"
            doodle={<ReceiptIcon />}
          >
            Your 5 free credits are already on the account — use them before
            buying more.
          </EmptyState>
        ) : (
          <Card>
            <ul className="purchase-list">
              {purchases.map((purchase) => (
                <li key={purchase.id}>
                  <span>
                    <strong>{purchase.credits_added} credits</strong> · ₹
                    {purchase.amount_paid / 100} · {formatDate(purchase.created_at)}
                  </span>
                  <StatusPill
                    status={purchase.status === "completed" ? "done" : "pending"}
                  />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <ButtonLink href="/app/dashboard" variant="white">
        ← Back to new notes
      </ButtonLink>

      <Modal
        open={explainOpen}
        onClose={() => setExplainOpen(false)}
        title="How credits work"
        footer={
          <Button variant="primary" onClick={() => setExplainOpen(false)}>
            Got it
          </Button>
        }
      >
        <ul className="purchase-list">
          <li>
            <span>New videos</span>
            <strong>1 credit</strong>
          </li>
          <li>
            <span>Re-running a video you already generated</span>
            <strong>Free</strong>
          </li>
          <li>
            <span>Sign-up bonus</span>
            <strong>5 credits</strong>
          </li>
        </ul>
        <p className="plan-lines">
          Credits are added to your account after the payment is confirmed, and
          every notebook stays in your history.
        </p>
      </Modal>
    </div>
  );
}
