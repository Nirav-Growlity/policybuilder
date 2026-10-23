/**
 * A realistic employee handbook built through the real domain model, for
 * render tests and template checks. The text follows the reference
 * handbooks' voice: addressed to the employee, short paragraphs, tables for
 * entitlements and actions.
 */
import type { RichTextBlock } from "../types";
import { getHandbookTopic } from "./catalog";
import { createEmptyChapter, createEmptyHandbook } from "./initial-handbook";
import type { HandbookChapter, HandbookManual, HandbookSection } from "./types";

let counter = 0;
const id = (prefix: string) => `${prefix}-${++counter}`;
const p = (text: string): RichTextBlock => ({ id: id("b"), type: "paragraph", text });
const ul = (...items: string[]): RichTextBlock => ({ id: id("b"), type: "bullets", text: items.join("\n") });
const table = (columns: string[], rows: string[][]): RichTextBlock => ({ id: id("b"), type: "table", text: "", columns, rows });

function fill(section: HandbookSection, content: RichTextBlock[] | { steps: Array<{ heading: string; body: string; responsible?: string }> }): HandbookSection {
  if (Array.isArray(content)) return "blocks" in section ? { ...section, blocks: content } : section;
  if (section.kind !== "procedure") return section;
  return { ...section, steps: content.steps.map((step) => ({ id: id("step"), heading: step.heading, body: [p(step.body)], ...(step.responsible ? { responsible: step.responsible } : {}) })) };
}

function chapter(topicId: string, contents: Array<RichTextBlock[] | { steps: Array<{ heading: string; body: string; responsible?: string }> }>): HandbookChapter {
  const topic = getHandbookTopic(topicId)!;
  const base = createEmptyChapter({ title: topic.title, catalogId: topic.id, part: topic.part, owner: topic.owner, outline: topic.outline });
  return { ...base, status: "draft", sections: base.sections.map((section, index) => (contents[index] ? fill(section, contents[index]) : section)) };
}

export function buildSampleHandbook(): HandbookManual {
  counter = 0;
  const manual = createEmptyHandbook();
  manual.company.name = "Meridian Textiles Pvt Ltd";
  manual.company.country = "India";
  manual.company.industry = "Manufacturing";
  manual.company.industryDetail = "Dyeing and finishing of cotton fabric";
  manual.control.docNo = "MTPL/HR/EH/01";
  manual.control.effectiveDate = "2026-11-01";
  manual.control.nextReviewDate = "2027-10-31";
  manual.control.preparedBy = "HR Manager";
  manual.control.reviewedBy = "Plant Head";
  manual.control.approvedBy = "Managing Director";
  manual.frontMatter.welcome = [p("Welcome to Meridian Textiles. Whether you joined us this week or have been with us for years, this handbook is your guide to how we work, what you can expect from us and what we expect from you.")];
  manual.frontMatter.about = [p("Meridian Textiles dyes and finishes cotton fabric for export brands in Europe and the United States. About 1,200 people work across our two units in Tamil Nadu.")];
  manual.frontMatter.vision = "To be the most trusted fabric finisher in India.";
  manual.frontMatter.mission = "To deliver consistent quality safely, fairly and with care for the environment.";
  manual.frontMatter.coreValues = [{ title: "Safety first", description: "No task is so urgent that it cannot be done safely." }, { title: "Respect", description: "Everyone is treated with dignity, whatever their role." }];
  manual.frontMatter.purpose = [p("This handbook explains the policies, benefits and rules that apply to you as an employee. It does not replace your appointment letter or the law.")];
  manual.frontMatter.howToUse = [p("Read the chapters that apply to you and keep this handbook for reference. Ask your manager or the HR department if anything is unclear.")];
  manual.frontMatter.sites = [{ location: "Unit 1", address: "SIPCOT Perundurai, Erode", primaryFunction: "Dyeing" }, { location: "Unit 2", address: "Tiruppur", primaryFunction: "Finishing" }];
  manual.facts = { profile: "", certifications: ["SA8000:2014"], regulations: [], contacts: [{ purpose: "Grievance", name: "HR Manager", phone: "+91 424 000 0000", email: "grievance@meridian.example" }] };
  manual.closing.reviewMechanism = [p("HR reviews this handbook every year and whenever the law or our policies change. Changes are approved by the Managing Director and shared with every employee.")];
  manual.closing.approval.statement = "This handbook is approved by the Managing Director and applies from its effective date.";
  manual.chapters = [
    chapter("employment-terms", [
      [p("You are employed as permanent, probationary, fixed-term or trainee staff, as your appointment letter says.")],
      [p("New employees serve six months of probation. Your manager reviews your progress at three and six months.")],
      [p("You are confirmed in writing when probation ends successfully.")],
    ]),
    chapter("working-hours", [
      [table(["Work pattern", "Days", "Hours"], [["General shift", "Monday to Saturday", "9:00 am to 5:30 pm"], ["Plant shifts", "Rotating", "6-2, 2-10, 10-6"]])],
      [p("Record your attendance with the biometric reader when you arrive and leave.")],
      [ul("Three late arrivals in a month count as half a day of casual leave.", "Absence without notice for three days may lead to disciplinary action.")],
    ]),
    chapter("leave-holidays", [
      [table(["Leave type", "Days a year", "Notes"], [["Earned leave", "18", "Carried forward up to 45 days"], ["Casual leave", "8", "Not carried forward"], ["Sick leave", "7", "Medical certificate after two days"]])],
      [p("Women employees receive 26 weeks of paid maternity leave. Fathers receive five days of paternity leave.")],
      [p("The holiday list for the year is published in January and displayed on the notice board.")],
      { steps: [{ heading: "Apply in advance", body: "Apply through the HR portal at least three days ahead for planned leave.", responsible: "Employee" }, { heading: "Approval", body: "Your manager approves or declines within two working days.", responsible: "Reporting Manager" }] },
    ]),
    chapter("code-of-conduct", [
      [p("This chapter sets the standards of behaviour everyone at Meridian keeps.")],
      [ul("Treat colleagues with respect.", "Follow safety rules at all times.", "Protect company property.")],
      [table(["Conduct", "Example"], [["Harassment", "Unwelcome remarks or contact"], ["Substance misuse", "Alcohol or drugs at work"]])],
    ]),
    chapter("anti-harassment", [
      [p("Harassment is any unwelcome conduct that violates a person's dignity, including sexual harassment.")],
      [p("Every employee is trained on this policy at induction and every year.")],
      { steps: [{ heading: "Raise the complaint", body: "Write to the Internal Committee within three months of the incident.", responsible: "Employee" }, { heading: "Inquiry", body: "The committee completes its inquiry within 90 days.", responsible: "Internal Committee" }] },
    ]),
    chapter("grievance", [
      [p("You can raise any concern about your work, pay, treatment or working conditions.")],
      [p("Speak to your manager, write to grievance@meridian.example or use the suggestion box at each unit.")],
      { steps: [{ heading: "Acknowledge", body: "HR acknowledges the grievance within two working days.", responsible: "HR Manager" }, { heading: "Resolve", body: "The grievance is investigated and resolved within 15 days.", responsible: "Grievance Committee" }] },
    ]),
    chapter("separation", [
      [p("Confirmed employees give one month of notice in writing. Probationers give one week.")],
      [p("The Company may end employment for misconduct after a fair inquiry.")],
      { steps: [{ heading: "Hand over", body: "Return company property and hand over your work.", responsible: "Employee" }, { heading: "Clearance", body: "Departments sign the clearance form.", responsible: "HR Manager" }] },
    ]),
  ];
  return manual;
}
