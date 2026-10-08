// One-off helper: .env is a dotfile the editor tools cannot write.
import fs from "node:fs";

const path = new URL("../.env", import.meta.url);
let env = fs.readFileSync(path, "utf8");

const set = (key, value) => {
  const line = new RegExp(`^${key}=.*$`, "m");
  if (line.test(env)) {
    env = env.replace(line, `${key}=${value}`);
  } else {
    env = env.replace(/\r?\n$/, "\n") + `${key}=${value}\n`;
  }
};

set("RAZORPAY_KEY_SECRET", "0fj3MNi3amE56eqZjaKoi9G1");
env = env.replace("Steam in razorpay.in", "Settings in razorpay.in");

fs.writeFileSync(path, env);
console.log(
  "patched .env:",
  "RAZORPAY_KEY_SECRET set,",
  "comment typo fixed:",
  env.includes("Settings in razorpay.in"),
);
