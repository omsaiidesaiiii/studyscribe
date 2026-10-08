import { PublicFooter, PublicNav } from "@/components/PublicShell";
import { Badge, ButtonLink, Sticker } from "@/components/ui/kit";
import {
  ArrayDoodle,
  BoltIcon,
  BookStack,
  CheckBox,
  GlobeIcon,
  GraphDoodle,
  LanguageIcon,
  LinkIcon,
  PinkArrow,
  PrinterIcon,
  SmileyDoodle,
  SparkIcon,
  Sparkle,
  StarDoodle,
  YouTubeIcon,
} from "@/components/ui/doodles";

/**
 * Landing page.
 *
 * Section order follows the reference design (header, hero, features,
 * how-it-works, sample + why, pricing, FAQ, final CTA, footer).
 *
 * Copy rules: end-user language only, and everything stated here is a fact of
 * this codebase — 5 free credits on sign-up, 1 credit per new video, re-runs of
 * the same video are free, three note languages, real prepaid plans. No
 * testimonials, user counts, ratings or logos are invented.
 */

const FEATURES = [
  {
    tone: "pink",
    icon: <YouTubeIcon />,
    title: "YouTube to notes",
    copy: "Paste a lecture link and get back structured, page-formatted notes.",
  },
  {
    tone: "green",
    icon: <GlobeIcon />,
    title: "Multi-language",
    copy: "Notes in English, हिन्दी or Hinglish — you pick before generating.",
  },
  {
    tone: "violet",
    icon: <SparkIcon />,
    title: "Reads the captions",
    copy: "The video's captions become the source, then get rewritten as notes.",
  },
  {
    tone: "orange",
    icon: <PrinterIcon />,
    title: "Print ready",
    copy: "Download an A4 PDF with ruled pages, headings and margin notes.",
  },
  {
    tone: "cyan",
    icon: <BoltIcon />,
    title: "Fast & simple",
    copy: "One link, one language, one model. That is the whole form.",
  },
];

const STEPS = [
  {
    number: "1",
    tone: "pink",
    icon: <LinkIcon />,
    title: "Paste a YouTube link",
    copy: "Any lecture with captions works — auto-generated captions count too.",
  },
  {
    number: "2",
    tone: "lime",
    icon: <LanguageIcon />,
    title: "Choose language and model",
    copy: "English, Hindi or Hinglish, and one of the three available models.",
  },
  {
    number: "3",
    tone: "violet",
    icon: <PrinterIcon />,
    title: "Get your notes",
    copy: "The notebook appears in your history, ready to read or download.",
  },
];

const SAMPLE_STEPS = [
  "Check the middle element.",
  "Target smaller → search the left half.",
  "Target larger → search the right half.",
  "Repeat until the value is found.",
];

const WHY = [
  {
    title: "Notebook pages",
    copy: "Ruled paper, headings, sticky notes and diagrams — not a wall of text.",
  },
  {
    title: "Three languages",
    copy: "English, हिन्दी (Devanagari) or Hinglish (Hindi in Latin script).",
  },
  {
    title: "Re-runs are free",
    copy: "Generating the same video again costs nothing — only new videos do.",
  },
  {
    title: "Printable",
    copy: "The PDF prints the way it looks on screen: A4, ink-friendly borders.",
  },
];

// Mirrors server/src/shared/credit-plans.ts — the paid packs, cheapest first.
const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: "₹50",
    credits: 25,
    perVideo: "₹2.00 per video",
    note: "Try a chapter",
  },
  {
    id: "popular",
    name: "Popular",
    price: "₹90",
    credits: 50,
    perVideo: "₹1.80 per video",
    note: "Most lectures",
    featured: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: "₹160",
    credits: 100,
    perVideo: "₹1.60 per video",
    note: "A whole semester",
  },
];

const FAQ = [
  {
    question: "Do I need an account?",
    answer:
      "Yes. Your account holds your credits and your notebooks, and new accounts start with 5 free credits.",
  },
  {
    question: "Which videos work?",
    answer:
      "Any YouTube lecture that has captions. Auto-generated captions are fine — they get rewritten into your chosen language.",
  },
  {
    question: "What does one notebook cost?",
    answer:
      "One credit per new video. If you generate the same video again, it is free — the saved notes are reused.",
  },
  {
    question: "What do I get at the end?",
    answer:
      "A notebook you can read in the browser and download as a print-ready A4 PDF.",
  },
  {
    question: "Which models can I pick?",
    answer:
      "Three are available, with the fastest as the default. Pick the slower, stronger one when a topic is dense.",
  },
];

export function LandingPage() {
  return (
    <div id="top">
      <PublicNav />

      <main>
        <div className="container">
          {/* ---------------------------------------------------------- Hero */}
          <section className="section hero">
            <div>
              <Sticker className="sticker-pink">
                Better notes. Bigger dreams.
              </Sticker>

              <h1>
                Turn YouTube lectures into{" "}
                <span className="marker">hand-written notes.</span>
              </h1>

              <p className="lede">
                Paste a link, choose your language and model, and get clean,
                printable notes — styled like real handwriting.
              </p>

              <div className="hero-actions">
                <ButtonLink href="/register" variant="primary">
                  Start learning →
                </ButtonLink>
                <ButtonLink href="#how-it-works" variant="white">
                  ▶ See how it works
                </ButtonLink>
              </div>

              <ul className="check-list">
                <li>
                  <CheckBox /> 5 free credits when you create an account
                </li>
                <li>
                  <CheckBox /> Works with auto-generated captions
                </li>
                <li>
                  <CheckBox /> Notes ready in minutes, as a PDF
                </li>
              </ul>
            </div>

            <div className="hero-visual">
              <div className="hero-stack">
                <span className="hero-back pink" aria-hidden="true" />
                <span className="hero-back violet" aria-hidden="true" />

                <div className="hero-note-wrap">
                  <div className="hero-note">
                    <span className="margin" aria-hidden="true" />
                    <span className="rule-lines" aria-hidden="true" />

                    <div className="hero-note-inner">
                      <h2>
                        <span className="marker">Graphs: basics</span>
                      </h2>
                      <p>Graph = nodes + edges.</p>
                      <p>Adjacency list: quick to walk, small on memory.</p>
                      <p>Matrix: O(1) edge check.</p>
                      <GraphDoodle className="hero-graph" />
                    </div>
                  </div>

                  <div className="hero-sticky">
                    Study smarter
                    <br />
                    not harder
                    <span className="sticky-smiley" aria-hidden="true">
                      <SmileyDoodle size={30} />
                    </span>
                  </div>

                  <div className="book-stack-wrap">
                    <BookStack />
                  </div>

                  <StarDoodle className="star-doodle" />
                </div>
              </div>
            </div>
          </section>

          {/* ------------------------------------------------------ Features */}
          <section className="section" id="features">
            <div className="panel panel-lavender">
              <div className="panel-head">
                <Sticker className="sticker-yellow">Features</Sticker>
                <h2>Everything you need for better learning.</h2>
                <Sparkle />
              </div>

              <div className="feature-grid">
                {FEATURES.map((feature) => (
                  <article className="feature-tile" key={feature.title}>
                    <span className={`feature-icon ${feature.tone}`}>
                      {feature.icon}
                    </span>
                    <h3>{feature.title}</h3>
                    <p>{feature.copy}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          {/* -------------------------------------------------- How it works */}
          <section className="how-panel" id="how-it-works">
            <div className="panel-head">
              <Sticker className="sticker-yellow">How it works</Sticker>
              <h2>Three simple steps to better notes.</h2>
            </div>

            <div className="step-row">
              <article className="step-card">
                <span className={`step-num ${STEPS[0].tone}`}>
                  {STEPS[0].number}
                </span>
                <span className="step-icon">{STEPS[0].icon}</span>
                <h3>{STEPS[0].title}</h3>
                <p>{STEPS[0].copy}</p>
              </article>

              <PinkArrow className="arrow-doodle" />

              <article className="step-card">
                <span className={`step-num ${STEPS[1].tone}`}>
                  {STEPS[1].number}
                </span>
                <span className="step-icon">{STEPS[1].icon}</span>
                <h3>{STEPS[1].title}</h3>
                <p>{STEPS[1].copy}</p>
              </article>

              <PinkArrow className="arrow-doodle" />

              <article className="step-card">
                <span className={`step-num ${STEPS[2].tone}`}>
                  {STEPS[2].number}
                </span>
                <span className="step-icon">{STEPS[2].icon}</span>
                <h3>{STEPS[2].title}</h3>
                <p>{STEPS[2].copy}</p>
              </article>
            </div>

            <div className="row that-is-it">
              <SmileyDoodle size={36} />
              <p className="lede no-margin">That's it! Your notes are ready.</p>
            </div>
          </section>

          {/* -------------------------------------------- Sample + why it fits */}
          <section className="section">
            <div className="panel panel-pink">
              <div className="sample-grid">
                <div className="ruled-paper sample-note">
                  <Badge tone="yellow">Sample page</Badge>
                  <h3>
                    <span className="marker">Binary search</span>
                  </h3>
                  <ol className="sample-steps">
                    {SAMPLE_STEPS.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                  <ArrayDoodle className="sample-array" />
                </div>

                <div className="panel love-panel">
                  <div className="panel-head">
                    <Sticker className="sticker-yellow">Why you'll like it</Sticker>
                  </div>

                  <div className="love-grid">
                    {WHY.map((item) => (
                      <article className="love-card" key={item.title}>
                        <p className="love-title">{item.title}</p>
                        <p className="no-margin">{item.copy}</p>
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ------------------------------------------------------- Pricing */}
          <section className="section" id="pricing">
            <div className="panel panel-lavender">
              <div className="panel-head">
                <Sticker className="sticker-yellow">Simple pricing</Sticker>
                <h2>Pay once. Keep the credits.</h2>
                <Sparkle />
              </div>

              <div className="plans">
                {PLANS.map((plan) => (
                  <article
                    className={`plan${plan.featured ? " featured" : ""}`}
                    key={plan.id}
                  >
                    <div className="row-between">
                      <span className="amount">{plan.price}</span>
                      {plan.featured ? (
                        <Badge tone="pink">Most popular</Badge>
                      ) : null}
                    </div>

                    <p className="credits no-margin">
                      {plan.name} — {plan.credits} credits
                    </p>
                    <p className="plan-lines no-margin">{plan.perVideo}</p>
                    <p className="muted no-margin">{plan.note}</p>

                    <ul>
                      <li>• 1 credit per new video</li>
                      <li>• Re-running the same video is free</li>
                      <li>• Credits never expire</li>
                    </ul>

                    <ButtonLink
                      href="/register"
                      variant={plan.featured ? "ink" : "white"}
                    >
                      Get {plan.credits} credits
                    </ButtonLink>
                  </article>
                ))}
              </div>

              <p className="muted pricing-note">
                One credit buys one new video — the bigger the pack, the cheaper
                each video. New accounts start with 5 free credits, so you can try
                it before paying.
              </p>
            </div>
          </section>

          {/* ----------------------------------------------------------- FAQ */}
          <section className="section" id="faq">
            <div className="panel-head">
              <Sticker className="sticker-yellow">Questions</Sticker>
              <h2>Good to know.</h2>
            </div>

            {FAQ.map((item) => (
              <details className="faq-item" key={item.question}>
                <summary className="faq-question">{item.question}</summary>
                <p className="faq-answer no-margin">{item.answer}</p>
              </details>
            ))}
          </section>

          {/* ----------------------------------------------------- Final CTA */}
          <section className="section">
            <div className="final-cta">
              <div>
                <h2>Your next lecture is one link away.</h2>
                <p className="no-margin">
                  Create an account and start with 5 free credits.
                </p>
              </div>

              <ButtonLink href="/register" variant="violet">
                Create a free account →
              </ButtonLink>
            </div>
          </section>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
