/**
 * Ready-made campaign plans for the Email Centre's Plans tab.
 *
 * A plan is a goal, an audience and a short series of ready-written emails.
 * Using a plan creates ordinary templates and campaigns through the same
 * endpoints the editors use, so every email can still be read, edited,
 * tested, scheduled or cancelled like any other campaign.
 *
 * Every number in the copy comes from the application itself: plan prices
 * and limits from src/config/plans.ts, catalogue counts from
 * src/marketing/product-facts.ts (which tests/marketing.test.ts proves
 * against the real catalogues). Copy sent to everyone only promises what
 * every plan has; the numbers that need a paid plan appear only in the
 * upgrade plan and the thank-you to paying members, and say so.
 * tests/email-plans.test.ts checks the rest (lengths, links, variables,
 * spelling, that each email survives the server's HTML cleaning).
 */
import { PLAN_CONFIG } from "../config/plans";
import type { GiftLength } from "../lib/gift-lengths";
import { CATALOG_COUNTS, LIVE_COUNTS } from "../marketing/product-facts";
import type { AudienceType, EmailAudienceFilter } from "./email-centre-api";

export const PLAN_SITE = "https://scenering.com";
const APP = `${PLAN_SITE}/app`;
const PRICING = `${PLAN_SITE}/pricing`;

/* ------------------------------------------------------------- copy blocks */

/** One piece of an email. `**bold**` works inside any text. */
export type PlanBlock =
  | { h: string }
  | { p: string }
  | { list: string[] }
  | { cta: string; href: string }
  | { sign: string };

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function inlineHtml(text: string): string {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
}
function inlineText(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1");
}

/** The HTML body (the server adds the Scenering layout, button styling and footer) and its plain-text twin. */
export function renderPlanBlocks(blocks: PlanBlock[]): { html: string; text: string } {
  const html: string[] = [];
  const text: string[] = [];
  for (const block of blocks) {
    if ("h" in block) {
      html.push(`<h2>${inlineHtml(block.h)}</h2>`);
      text.push(inlineText(block.h));
    } else if ("p" in block) {
      html.push(`<p>${inlineHtml(block.p)}</p>`);
      text.push(inlineText(block.p));
    } else if ("list" in block) {
      html.push(`<ul>\n${block.list.map((item) => `  <li>${inlineHtml(item)}</li>`).join("\n")}\n</ul>`);
      text.push(block.list.map((item) => `- ${inlineText(item)}`).join("\n"));
    } else if ("cta" in block) {
      html.push(`<p><a class="cta" href="${escapeHtml(block.href)}">${escapeHtml(block.cta)}</a></p>`);
      text.push(`${block.cta}: ${block.href}`);
    } else {
      html.push(`<p>${block.sign.split("\n").map(inlineHtml).join("<br>")}</p>`);
      text.push(block.sign);
    }
  }
  return { html: html.join("\n"), text: text.join("\n\n") };
}

/* ------------------------------------------------------------------- facts */

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const say = (value: number) => WORDS[value] ?? String(value);
const minutes = (value: number) => `${value} minute${value === 1 ? "" : "s"}`;
/** "1-minute", as in "the 1-minute limit". */
const minuteLimit = (value: number) => `${value}-minute`;

const FREE = PLAN_CONFIG.free;
const FLOW = PLAN_CONFIG.sceneflow;
const FORGE = PLAN_CONFIG.sceneforge;
const FREE_SHORTS = FREE.limits.shortExportsPerWeek ?? 0;
const FREE_LONG = FREE.limits.longExportsPerWeek ?? 0;
const FREE_SHORT_MINUTES = FREE.limits.maxShortMinutes ?? 1;
const FREE_LONG_MINUTES = FREE.limits.maxLongMinutes ?? 5;
const FLOW_DOWNLOADS = FLOW.limits.finalExportsPerWeek;
/** "two Shorts and one long video" — the Free plan's weekly downloads. */
const FREE_WEEKLY = `${say(FREE_SHORTS)} Shorts and ${say(FREE_LONG)} long video${FREE_LONG === 1 ? "" : "s"}`;
const FLOW_WEEKLY = FLOW_DOWNLOADS === null ? "unlimited downloads" : `${FLOW_DOWNLOADS} video downloads every week`;
const FORGE_WEEKLY = FORGE.limits.finalExportsPerWeek === null ? "no weekly download limit" : `${FORGE.limits.finalExportsPerWeek} video downloads every week`;
const price = (value: number) => `$${value}`;
/** "(Free includes two of each)", or each number when they differ. */
const FREE_VOICES = FREE.limits.voicePresets ?? 0;
const FREE_CAPTIONS = FREE.limits.captionStyles ?? 0;
const FREE_SHARE = FREE_VOICES === FREE_CAPTIONS
  ? `${FREE.name} includes ${say(FREE_VOICES)} of each`
  : `${FREE.name} includes ${say(FREE_VOICES)} narrator${FREE_VOICES === 1 ? "" : "s"} and ${say(FREE_CAPTIONS)} caption style${FREE_CAPTIONS === 1 ? "" : "s"}`;

/* ------------------------------------------------------------------- plans */

export interface PlanEmail {
  /** Short title, used in the template and campaign names. */
  title: string;
  category: "welcome" | "getting_started" | "training" | "product_update" | "announcement" | "promotion" | "newsletter" | "re_engagement";
  /** Days after the plan's first email. */
  day: number;
  subject: string;
  preheader: string;
  blocks: PlanBlock[];
}

export interface CampaignPlan {
  id: string;
  name: string;
  /** What the plan is for, in one line. */
  goal: string;
  /** When to use it. */
  when: string;
  audience: {
    type: AudienceType;
    /** Who receives it, in plain words. */
    label: string;
    /** The audience settings, worked out when the plan is used. */
    filter: (now: Date) => EmailAudienceFilter;
  };
  /** The emails ask members to reply, so replies should reach the Inbox. */
  invitesReplies: boolean;
  /**
   * The plan hands out a gift code (Email Centre, Gifts). Its emails carry
   * the code: [[gift]], [[Gift]], [[plan]], [[code]], [[link]], [[claim_by]]
   * and [[downloads]] are filled in from the code when the plan is used
   * (fillGift). These values are the gift suggested when making the code.
   */
  gift?: { planId: "sceneflow" | "sceneforge"; period: GiftLength };
  emails: PlanEmail[];
}

const dayOnly = (date: Date) => date.toISOString().slice(0, 10);

export const CAMPAIGN_PLANS: readonly CampaignPlan[] = [
  {
    id: "welcome-series",
    name: "Welcome new members",
    goal: "Make new members feel welcome and guide them to their first video.",
    when: "Use it every month for the members who joined that month.",
    audience: {
      type: "registered_range",
      label: "Members who joined in the last 30 days",
      filter: (now) => ({ registeredFrom: dayOnly(new Date(now.getTime() - 30 * 86400000)), registeredTo: dayOnly(now) }),
    },
    invitesReplies: true,
    emails: [
      {
        title: "Welcome to Scenering",
        category: "welcome",
        day: 0,
        subject: "Welcome to Scenering, {{first_name}}",
        preheader: "Six clear steps from your script to a finished video.",
        blocks: [
          { h: "Welcome, {{first_name}}." },
          { p: "I'm Vincent, and I'm glad you're here. Scenering turns what you want to say into a finished video, one clear step at a time." },
          { p: "**Here is the whole journey:**" },
          {
            list: [
              "**Setup**: paste or write your script, name the project and choose a Short or a long video.",
              "**Scenes**: your script is divided into scenes, and each scene gets pictures found from its own words.",
              "**Voice Over**: choose a narrator and give every scene a voice.",
              "**Captions**: pick a caption style so viewers can follow along.",
              "**Video Studio**: add music and your finishing touches.",
              "**Render**: your finished video is saved in your Vault, ready to download.",
            ],
          },
          { cta: "Start your first video", href: APP },
          { p: "If you get stuck, just reply to this email. It comes straight to me." },
          { sign: "Vincent\nScenering" },
        ],
      },
      {
        title: "Start with your script",
        category: "getting_started",
        day: 2,
        subject: "The easiest way to start: your script",
        preheader: "Write the way you speak. Scenering turns it into scenes.",
        blocks: [
          { h: "Start with what you want to say" },
          { p: "Hi {{first_name}}, the best videos on Scenering start with a simple script. You don't need anything else to begin." },
          { p: "**Three tips that make a big difference:**" },
          {
            list: [
              "**Write the way you speak.** Short sentences sound natural when they are narrated.",
              "**One idea per sentence.** Your script is divided into scenes that follow the narration, so clear sentences make clear scenes.",
              "**Keep a Short short.** About a minute of narration is roughly 130 to 150 words.",
            ],
          },
          { p: "Paste your script into Setup, choose your format, and Scenering turns it into scenes for you." },
          { cta: "Write your script", href: APP },
          { sign: "Vincent" },
        ],
      },
      {
        title: "What are you making?",
        category: "getting_started",
        day: 5,
        subject: "What would you like to make, {{first_name}}?",
        preheader: "Reply and tell me. I read every reply myself.",
        blocks: [
          { h: "I'd love to hear from you" },
          { p: "Hi {{first_name}}, you've had Scenering for a few days now, and I'd like to know what you're making, or what you'd like to make." },
          { p: "Shorts for your channel, explainer videos for your business, stories for your audience: whatever it is, hit reply and tell me in a sentence or two. I read every reply myself, and your answer helps decide what Scenering does next." },
          { p: "And if something didn't work the way you expected, please tell me that too." },
          { cta: "Open Scenering", href: APP },
          { sign: "Vincent\nScenering" },
        ],
      },
    ],
  },
  {
    id: "first-video",
    name: "Finish a first video",
    goal: "Help members who signed up but never finished a video to get one done.",
    when: "Use it whenever this group grows. It is the plan that gets people using Scenering.",
    audience: { type: "no_video_yet", label: "Members who have not downloaded a video yet", filter: () => ({}) },
    invitesReplies: true,
    emails: [
      {
        title: "Your first video",
        category: "getting_started",
        day: 0,
        subject: "Your first video is closer than you think",
        preheader: "Paste a short script and Scenering builds the scenes for you.",
        blocks: [
          { h: "Let's make your first video" },
          { p: "Hi {{first_name}}, you have a Scenering account, but you haven't finished a video yet. Let's change that this week." },
          { p: "**Here is the shortest path:**" },
          {
            list: [
              "Open Scenering and start a new project.",
              "Paste a short script. Five sentences is plenty.",
              "Look through your scenes and swap any picture you don't like.",
              "Choose a narrator, then a caption style.",
              "Render, and your video is waiting in your Vault.",
            ],
          },
          { cta: "Make my first video", href: APP },
          { p: "Your first video doesn't need to be perfect. It just needs to exist." },
          { sign: "Vincent" },
        ],
      },
      {
        title: "Three ideas to try",
        category: "training",
        day: 3,
        subject: "Not sure what to make? Try one of these",
        preheader: "Three video ideas you can make today, with no filming.",
        blocks: [
          { h: "Three ideas you can make today" },
          { p: "Hi {{first_name}}, the hardest part is often deciding what to make. Here are three ideas that work well with Scenering, and none of them need a camera:" },
          {
            list: [
              "**A quick tip from your work.** One useful thing you know that others don't, in five or six sentences.",
              "**A short story.** Something that happened to you, a customer or a place you love.",
              "**A top-three list.** Three tools, places, books or habits, with one sentence on each.",
            ],
          },
          { p: "Write it the way you would say it out loud, paste it into Setup, and Scenering finds pictures for every scene." },
          { cta: "Try one now", href: APP },
          { sign: "Vincent" },
        ],
      },
      {
        title: "Your weekly downloads",
        category: "getting_started",
        day: 7,
        subject: "Your weekly downloads are waiting",
        preheader: "Render as often as you like. Your downloads come round every week.",
        blocks: [
          { h: "Don't let this week's downloads go unused" },
          { p: `Hi {{first_name}}, every Scenering plan comes with video downloads every week. On the Free plan that's ${FREE_WEEKLY}, every week, with no payment required.` },
          { p: "You can preview and render as often as you like while you get it right. A download is only counted when you download the finished video from your Vault." },
          { cta: "Finish a video this week", href: APP },
          { p: "Questions? Reply to this email and I'll help you myself." },
          { sign: "Vincent" },
        ],
      },
    ],
  },
  {
    id: "win-back",
    name: "Win back quiet members",
    goal: "Bring back members who haven't downloaded a video for a month.",
    when: "Use it once a month. The audience is worked out again when each email is sent.",
    audience: { type: "inactive", label: "Members with no video download in the last 30 days", filter: () => ({ inactiveDays: 30 }) },
    invitesReplies: true,
    emails: [
      {
        title: "Ready for your next video?",
        category: "re_engagement",
        day: 0,
        subject: "It's been a while, {{first_name}}",
        preheader: "Your next video can start with a few sentences.",
        blocks: [
          { h: "Ready for your next video?" },
          { p: "Hi {{first_name}}, it's been a little while since your last video on Scenering, so here's a gentle nudge." },
          { p: "Starting again is quick: open a new project, paste a few sentences, and Scenering divides them into scenes and finds pictures for each one." },
          { p: "**Need an idea?** Take a question a customer or follower asked you recently, and answer it in under a minute." },
          { cta: "Start a new video", href: APP },
          { sign: "Vincent" },
        ],
      },
      {
        title: "Can I help?",
        category: "re_engagement",
        day: 5,
        subject: "Can I help with anything?",
        preheader: "If something got in the way, I'd like to know.",
        blocks: [
          { h: "Is something in the way?" },
          { p: "Hi {{first_name}}, people usually stop making videos for one of three reasons: they ran out of time, they ran out of ideas, or something didn't work the way they hoped." },
          { p: "If it's the last one, I really want to know. Hit reply and tell me what happened. It comes straight to me, and I'll answer you personally." },
          { p: "And if you just need a fresh start, the button below opens Scenering." },
          { cta: "Open Scenering", href: APP },
          { sign: "Vincent\nScenering" },
        ],
      },
    ],
  },
  {
    id: "upgrade",
    name: "Upgrade free members",
    goal: "Show free members what a paid plan adds, with honest prices.",
    when: "Use it when members have had time to try the Free plan.",
    audience: { type: "free_plan", label: "Members on the Free plan", filter: () => ({}) },
    invitesReplies: true,
    emails: [
      {
        title: "What SceneFlow adds",
        category: "promotion",
        day: 0,
        subject: `What you get with ${FLOW.name}`,
        preheader: `Every creative feature and ${FLOW_WEEKLY}, from ${price(FLOW.annualMonthlyEquivalent)} a month.`,
        blocks: [
          { h: "Ready for more than the basics?" },
          { p: `Hi {{first_name}}, the Free plan is a real way to make videos: ${FREE_WEEKLY} every week. When you want more, ${FLOW.name} unlocks everything:` },
          {
            list: [
              `**All ${LIVE_COUNTS.voices} narrators** and **all ${LIVE_COUNTS.captionStyles} caption styles** (${FREE_SHARE}).`,
              `**The full Video Studio**: ${CATALOG_COUNTS.filters} filters, ${CATALOG_COUNTS.textTemplates} text templates, ${CATALOG_COUNTS.stickers} stickers, ${CATALOG_COUNTS.lowerThirds} lower thirds and ${CATALOG_COUNTS.soundEffects} sound effects.`,
              `**All ${CATALOG_COUNTS.musicTracks} music tracks** and **all ${CATALOG_COUNTS.visualisers} sound visualisers**.`,
              `**${FLOW_DOWNLOADS} video downloads every week**, without the Free plan's ${minuteLimit(FREE_SHORT_MINUTES)} limit on Shorts or ${minuteLimit(FREE_LONG_MINUTES)} limit on long videos.`,
            ],
          },
          { p: `${FLOW.name} is **${price(FLOW.prices.monthly)} a month**, or **${price(FLOW.prices.yearly)} a year**. That's ${price(FLOW.annualMonthlyEquivalent)} a month, and you save ${price(FLOW.annualSaving)}.` },
          { cta: "See the plans", href: PRICING },
          { sign: "Vincent" },
        ],
      },
      {
        title: "Which plan fits you?",
        category: "promotion",
        day: 5,
        subject: `${FREE.name}, ${FLOW.name} or ${FORGE.name}?`,
        preheader: "A quick, honest comparison so you can choose.",
        blocks: [
          { h: "Which plan fits you?" },
          { p: "Hi {{first_name}}, here's the short version:" },
          {
            list: [
              `**${FREE.name}**: ${price(FREE.prices.monthly)}. ${say(FREE_SHORTS).replace(/^./, (c) => c.toUpperCase())} Shorts (up to ${minutes(FREE_SHORT_MINUTES)}) and ${say(FREE_LONG)} long video (up to ${minutes(FREE_LONG_MINUTES)}) every week, with the essential tools.`,
              `**${FLOW.name}**: ${price(FLOW.prices.monthly)} a month or ${price(FLOW.prices.yearly)} a year. Every creative feature and ${FLOW_WEEKLY}.`,
              `**${FORGE.name}**: ${price(FORGE.prices.monthly)} a month or ${price(FORGE.prices.yearly)} a year. Every creative feature with ${FORGE_WEEKLY}, for people who publish a lot.`,
            ],
          },
          { p: `If you make a video or two a week, ${FREE.name} may be all you need. If you publish several times a week or want the full Video Studio, ${FLOW.name} is made for you.` },
          { cta: "Compare the plans", href: PRICING },
          { p: "Not sure? Reply with what you make and how often, and I'll tell you honestly which plan makes sense." },
          { sign: "Vincent" },
        ],
      },
    ],
  },
  {
    id: "gift-month",
    name: "Free month gift",
    goal: "Give Free members a month of SceneFlow, so they see everything Scenering can do and some of them stay on.",
    when: "Use it now and then, for example for Free members who have been with you for a few weeks.",
    audience: { type: "free_plan", label: "Members on the Free plan", filter: () => ({}) },
    invitesReplies: true,
    gift: { planId: "sceneflow", period: "month" },
    emails: [
      {
        title: "Your gift",
        category: "promotion",
        day: 0,
        subject: "{{first_name}}, a gift from me: [[gift]]",
        preheader: "Use the code [[code]] by [[claim_by]] and every creative feature opens up.",
        blocks: [
          { h: "[[Gift]], on me" },
          { p: "Hi {{first_name}}, thank you for making videos with Scenering. I'd like you to see everything it can do, so here is [[gift]] as a gift. There is nothing to pay and no card needed." },
          { p: "While the gift lasts you have:" },
          {
            list: [
              `**All ${LIVE_COUNTS.voices} narrators** and **all ${LIVE_COUNTS.captionStyles} caption styles** (${FREE_SHARE}).`,
              `**The full Video Studio**: ${CATALOG_COUNTS.filters} filters, ${CATALOG_COUNTS.textTemplates} text templates, ${CATALOG_COUNTS.stickers} stickers, ${CATALOG_COUNTS.lowerThirds} lower thirds and ${CATALOG_COUNTS.soundEffects} sound effects.`,
              `**All ${CATALOG_COUNTS.musicTracks} music tracks** and **all ${CATALOG_COUNTS.visualisers} sound visualisers**.`,
              `**[[downloads]]**, without the Free plan's ${minuteLimit(FREE_SHORT_MINUTES)} limit on Shorts or ${minuteLimit(FREE_LONG_MINUTES)} limit on long videos.`,
            ],
          },
          { p: "Your code is **[[code]]**. Click the button and it is added to your account. Use it by **[[claim_by]]**." },
          { cta: "Claim my gift", href: "[[link]]" },
          { p: "When the gift ends, your account simply goes back to Free. You are never charged for it." },
          { sign: "Vincent" },
        ],
      },
      {
        title: "Reminder",
        category: "promotion",
        day: 4,
        subject: "Still waiting for you: [[gift]]",
        preheader: "Your code [[code]] works until [[claim_by]]. One click and it's yours.",
        blocks: [
          { p: "Hi {{first_name}}," },
          { p: "A quick reminder: [[gift]] is still waiting for you. Your code **[[code]]** works until **[[claim_by]]**." },
          { p: "An idea for the free time: take a script you have been meaning to make and turn it into a long video, with your favourite narrator and captions to match." },
          { cta: "Claim my gift", href: "[[link]]" },
          { p: "If something is stopping you from making videos, reply and tell me. I read every reply." },
          { sign: "Vincent" },
        ],
      },
    ],
  },
  {
    id: "tips-course",
    name: "Four-week creator course",
    goal: "Teach members to make better videos, one short lesson a week.",
    when: "Use it any time. It suits new and experienced members alike.",
    audience: { type: "all_consented", label: "Everyone who agreed to receive emails", filter: () => ({}) },
    invitesReplies: true,
    emails: [
      {
        title: "Lesson 1: the first sentence",
        category: "training",
        day: 0,
        subject: "Lesson 1: The first sentence decides everything",
        preheader: "How to open a video so people keep watching.",
        blocks: [
          { h: "Lesson 1: Your first sentence" },
          { p: "Hi {{first_name}}, welcome to a short four-week course on making better videos with Scenering. One lesson a week, one idea at a time." },
          { p: "This week: **the first sentence**. On Shorts especially, people decide in a moment whether to keep watching, so open with the most interesting thing you have to say:" },
          {
            list: [
              "**Ask a question** your viewer wants answered.",
              "**Make a bold promise**, such as \"Three mistakes that make videos boring\".",
              "**Start in the middle** of the story, not at the beginning.",
            ],
          },
          { p: "Try it: rewrite only the first sentence of your next script, and notice how different the whole video feels." },
          { cta: "Try it in Scenering", href: APP },
          { sign: "Vincent" },
        ],
      },
      {
        title: "Lesson 2: pictures for every scene",
        category: "training",
        day: 7,
        subject: "Lesson 2: Better pictures for every scene",
        preheader: "Concrete words find better pictures.",
        blocks: [
          { h: "Lesson 2: Words that find good pictures" },
          { p: "Hi {{first_name}}, in Scenes, every scene gets a picture search built from its own words. That means the words you write shape the pictures you get." },
          {
            list: [
              "**Be concrete.** \"A fisherman pulling in nets at sunrise\" finds better pictures than \"hard work\".",
              "**Name things.** Places, objects and actions give the search something to hold on to.",
              "**Replace freely.** If a picture isn't right, swap it. Any scene's picture can be replaced.",
            ],
          },
          { cta: "Open Scenering", href: APP },
          { sign: "Vincent" },
        ],
      },
      {
        title: "Lesson 3: voice and captions",
        category: "training",
        day: 14,
        subject: "Lesson 3: Make your narration easy to follow",
        preheader: "Choosing a voice and captions that suit your story.",
        blocks: [
          { h: "Lesson 3: Voice and captions" },
          { p: "Hi {{first_name}}, a good narrator and clear captions keep people watching, even with the sound off." },
          {
            list: [
              "**Preview before you choose.** In Voice Over you can listen to a line before you narrate the whole project.",
              "**Match the voice to the mood.** A calm voice for stories, a brighter one for tips.",
              "**Caption for silent viewers.** Many people watch with the sound off, so pick a caption style that is easy to read. Word-by-word captions suit Shorts well.",
              "**Let the voice set the pace.** Scene lengths follow the narration, so your pictures change with the voice.",
            ],
          },
          { cta: "Try a new voice", href: APP },
          { sign: "Vincent" },
        ],
      },
      {
        title: "Lesson 4: the finishing touches",
        category: "training",
        day: 21,
        subject: "Lesson 4: The finishing touches",
        preheader: "Music, a clear call to action, and knowing when to stop.",
        blocks: [
          { h: "Lesson 4: Finish strong" },
          { p: "Hi {{first_name}}, the last step before Render is Video Studio, where a good video becomes your video." },
          {
            list: [
              "**Keep the music quiet** under the narration. It should support the voice, not compete with it.",
              "**End with a call to action.** Tell viewers exactly what to do next: follow, subscribe or visit your website.",
              "**Keep it simple.** One or two finishing touches are better than ten.",
            ],
          },
          { p: "That's the end of the course. Thank you for following along. I'd love to see what you make, so reply and send me a link." },
          { cta: "Finish a video", href: APP },
          { sign: "Vincent" },
        ],
      },
    ],
  },
  {
    id: "thank-paid",
    name: "Thank paying members",
    goal: "Thank paying members personally and show them what their plan includes.",
    when: "Use it a few weeks after new members upgrade, or once a quarter.",
    audience: { type: "paid_plan", label: "Members on SceneFlow or SceneForge", filter: () => ({}) },
    invitesReplies: true,
    emails: [
      {
        title: "Thank you",
        category: "training",
        day: 0,
        subject: "Thank you, {{first_name}}",
        preheader: "A few things your plan includes that are worth trying this week.",
        blocks: [
          { h: "Thank you for supporting Scenering" },
          { p: "Hi {{first_name}}, thank you for choosing a paid plan. It genuinely makes a difference, and I wanted to thank you personally." },
          { p: "Here are a few things your plan includes that are worth trying:" },
          {
            list: [
              `**${LIVE_COUNTS.voices} narrators and ${LIVE_COUNTS.captionStyles} caption styles.** Try a new combination on your next video.`,
              `**${CATALOG_COUNTS.filters} filters and ${CATALOG_COUNTS.textTemplates} text templates** in Video Studio.`,
              `**${CATALOG_COUNTS.stickers} stickers and ${CATALOG_COUNTS.lowerThirds} lower thirds** for names, titles and emphasis.`,
              `**${CATALOG_COUNTS.visualisers} sound visualisers** for videos led by audio.`,
            ],
          },
          { cta: "Open Scenering", href: APP },
          { p: "If there's anything you'd like Scenering to do better, reply and tell me. Ideas from paying members go to the top of my list." },
          { sign: "Vincent" },
        ],
      },
    ],
  },
  {
    id: "feedback",
    name: "Ask what members need",
    goal: "Ask one simple question. The answers arrive in your Inbox and show you what to build next.",
    when: "Use it once or twice a year, or before you plan new features.",
    audience: { type: "all_consented", label: "Everyone who agreed to receive emails", filter: () => ({}) },
    invitesReplies: true,
    emails: [
      {
        title: "One question",
        category: "announcement",
        day: 0,
        subject: "One question, {{first_name}}",
        preheader: "What's the one thing that would make Scenering better for you?",
        blocks: [
          { h: "Can I ask you one question?" },
          { p: "Hi {{first_name}}, I'm Vincent from Scenering. I'm deciding what to improve next, and the best people to ask are the people using it." },
          { p: "**What's the one thing that would make Scenering more useful to you?**" },
          { p: "It could be a feature you're missing, something that confused you, or the kind of video you wish you could make. Just hit reply. One sentence is perfect, and I read every answer myself." },
          { cta: "Open Scenering", href: APP },
          { sign: "Vincent\nScenering" },
        ],
      },
    ],
  },
];

/**
 * The emails of the "Gift ending reminder" programme (src/admin/email-programmes.ts):
 * `day` is days BEFORE the gift ends. Kept here so the prices and limits come
 * from the same facts as the plans.
 */
export const GIFT_ENDING_EMAILS: readonly PlanEmail[] = [
  {
    title: "A week left",
    category: "promotion",
    day: 7,
    subject: "Your free time on Scenering ends in a week",
    preheader: "Here is how to keep every creative feature when it ends.",
    blocks: [
      { h: "One week left" },
      { p: "Hi {{first_name}}, I hope you've enjoyed the extra time on Scenering. Your gift ends in about a week." },
      { p: `When it ends, your account goes back to the ${FREE.name} plan, with ${FREE_WEEKLY} every week. To keep every creative feature, choose a plan:` },
      {
        list: [
          `**${FLOW.name}**: ${price(FLOW.prices.monthly)} a month or ${price(FLOW.prices.yearly)} a year, with ${FLOW_WEEKLY}.`,
          `**${FORGE.name}**: ${price(FORGE.prices.monthly)} a month or ${price(FORGE.prices.yearly)} a year, with ${FORGE_WEEKLY}.`,
        ],
      },
      { cta: "See the plans", href: PRICING },
      { p: "Not sure which one fits? Reply and tell me what you make, and I'll tell you honestly." },
      { sign: "Vincent" },
    ],
  },
  {
    title: "Ends tomorrow",
    category: "promotion",
    day: 1,
    subject: "Your free time on Scenering ends tomorrow",
    preheader: "Choose a plan today to keep every creative feature.",
    blocks: [
      { p: "Hi {{first_name}}," },
      { p: `A quick reminder: your gift ends tomorrow, and your account goes back to the ${FREE.name} plan.` },
      { p: `If Scenering has been useful, ${FLOW.name} keeps every creative feature from ${price(FLOW.annualMonthlyEquivalent)} a month on the yearly plan.` },
      { cta: "Choose a plan", href: PRICING },
      { sign: "Vincent" },
    ],
  },
];

/* ---------------------------------------------------------- using a plan */

/** The gift code a gift plan's emails carry. */
export interface PlanGift {
  code: string;
  planId: "sceneflow" | "sceneforge";
  /** Gift length id (src/lib/gift-lengths.ts). */
  period: string;
  /** The last moment the code can be used. */
  expiresAt: string;
}

/** Stands in for the real code in previews; the real one is made when the plan is used. */
export const EXAMPLE_GIFT_CODE = "GIFT-EXAMPLE";
export function exampleGift(plan: CampaignPlan, now: Date = new Date()): PlanGift {
  const lastDay = plan.emails[plan.emails.length - 1].day;
  return { code: EXAMPLE_GIFT_CODE, planId: plan.gift?.planId || "sceneflow", period: plan.gift?.period || "month", expiresAt: new Date(now.getTime() + (lastDay + 14) * 86400000).toISOString() };
}

const GIFT_PHRASE: Record<string, string> = {
  week: "a free week", month: "a free month", "3 months": "three free months", "6 months": "six free months", year: "a free year",
};

/** "a free month of SceneFlow" */
export function giftPhrase(gift: Pick<PlanGift, "planId" | "period">): string {
  return `${GIFT_PHRASE[gift.period] || "free time"} of ${PLAN_CONFIG[gift.planId].name}`;
}

/** The link that adds the code to a member's account (they sign in first if needed). */
export function giftClaimLink(code: string): string {
  return `${APP}?code=${encodeURIComponent(code)}`;
}

/** Puts a gift code into a gift plan's text. */
export function fillGift(text: string, gift: PlanGift): string {
  const phrase = giftPhrase(gift);
  const claimBy = new Date(gift.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
  const downloads = gift.planId === "sceneforge" ? FORGE_WEEKLY : FLOW_WEEKLY;
  return text
    .replace(/\[\[gift\]\]/g, phrase)
    .replace(/\[\[Gift\]\]/g, phrase.charAt(0).toUpperCase() + phrase.slice(1))
    .replace(/\[\[plan\]\]/g, PLAN_CONFIG[gift.planId].name)
    .replace(/\[\[code\]\]/g, gift.code)
    .replace(/\[\[link\]\]/g, giftClaimLink(gift.code))
    .replace(/\[\[claim_by\]\]/g, claimBy)
    .replace(/\[\[downloads\]\]/g, downloads.charAt(0).toUpperCase() + downloads.slice(1));
}

/** A piece of a plan's text as the owner reads it on screen: a gift plan's
 *  placeholders filled from the gift (or the example code). */
export function planDisplayText(plan: CampaignPlan, text: string, gift?: PlanGift): string {
  return plan.gift ? fillGift(text, gift || exampleGift(plan)) : text;
}

/** The name each plan email gets in Templates. Using a plan again reuses these templates, with any edits made to them.
 *  A gift plan's templates carry their code, so each code gets its own. */
export function planTemplateName(plan: CampaignPlan, index: number, gift?: PlanGift): string {
  return `Plan: ${plan.name} (${index + 1} of ${plan.emails.length}) ${plan.emails[index].title}${plan.gift && gift ? `, ${gift.code}` : ""}`;
}

/** The fields sent to POST /api/admin/email/templates. A gift plan without a
 *  gift (previews) shows the example code. */
export function planTemplatePayload(plan: CampaignPlan, index: number, gift?: PlanGift) {
  const email = plan.emails[index];
  const body = renderPlanBlocks(email.blocks);
  const usedGift = plan.gift ? gift || exampleGift(plan) : null;
  const fill = (text: string) => (usedGift ? fillGift(text, usedGift) : text);
  return {
    name: planTemplateName(plan, index, gift),
    description: `${plan.name}, email ${index + 1} of ${plan.emails.length}. ${plan.goal}${usedGift && gift ? ` Gift code ${gift.code}.` : ""}`,
    category: email.category,
    subject: fill(email.subject),
    preheader: fill(email.preheader),
    htmlBody: fill(body.html),
    textBody: fill(body.text),
  };
}

/** "Welcome new members (2 of 3) Start with your script, Oct 2026" */
export function planCampaignName(plan: CampaignPlan, index: number, now: Date): string {
  const month = now.toLocaleString("en-GB", { month: "short", year: "numeric" });
  return `${plan.name} (${index + 1} of ${plan.emails.length}) ${plan.emails[index].title}, ${month}`;
}

/** When each email goes out if the first one is sent at `start`. */
export function planSendTimes(plan: CampaignPlan, start: Date): Date[] {
  return plan.emails.map((email) => new Date(start.getTime() + email.day * 86400000));
}

/** "3 emails over 5 days" / "1 email" */
export function planLengthLabel(plan: CampaignPlan): string {
  const count = plan.emails.length;
  const span = plan.emails[count - 1].day;
  return count === 1 ? "1 email" : `${count} emails over ${span} days`;
}
