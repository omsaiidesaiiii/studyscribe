/// <reference types="vite/client" />

/**
 * Declaration for the global `Razorpay` object injected by the CDN
 * script tag (`https://checkout.razorpay.com/v1/checkout.js`) in
 * `index.html`. The Razorpay JS SDK exposes a constructor that accepts a
 * configuration object and a `checkout` instance with an `open()` method.
 */

interface RazorpayModalOptions {
  name?: string;
  description?: string;
  image?: string;
  theme?: { color?: string; surfaceColor?: string; borderRadius?: string };
  modal?: {
    width?: string;
    closeOnPressBack?: boolean;
    openDelay?: number;
    closeDelay?: number;
    overlayOpacity?: number;
    theme?: { color?: string };
    style?: { body?: { background?: string } };
  };
  prefill?: { name?: string; email?: string; contact?: string };
  onPaymentSuccess?: (response: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => void;
  onPaymentError?: (error: { code: string; description: string }) => void;
  onClose?: () => void;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency?: string;
  name?: string;
  description?: string;
  order_id: string;
  handler?: (response: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => void;
  modal?: RazorpayModalOptions["modal"];
  prefill?: RazorpayModalOptions["prefill"];
  theme?: { color?: string; surfaceColor?: string; borderRadius?: string };
  [key: string]: unknown;
}

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => {
      open: () => void;
      close: () => void;
      [key: string]: unknown;
    };
  }
}

export {};
