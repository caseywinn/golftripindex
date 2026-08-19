import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getWriteBase, describeAirtableError } from "@/lib/airtableWrite";

const APPLICATIONS_TABLE = process.env.AIRTABLE_EVENT_APPLICATIONS_TABLE || "EventApplications";

/**
 * Interest/waitlist capture for the GTI event landing pages. Not a booking:
 * no payment, no date or venue selection, no account.
 *
 * Age is recorded, never rejected. The event is aimed at 6–14, but a dad with a
 * 5-year-old is a lead worth reading, not a 400. The form warns about fit; this
 * route just records what was typed.
 */
const ApplicationSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(200),
  kidName: z.string().trim().min(1, "Kid's name is required").max(120),
  kidAge: z.coerce.number().int().min(1).max(21),
  homeRegion: z.string().trim().min(1, "Home city or region is required").max(160),
  notes: z.string().trim().max(2000).optional().default(""),
  event: z.string().trim().max(120).optional().default("Father-Son Invitational"),
  // Honeypot. Real people never see this field, so anything in it is a bot.
  // Named to look like something a form-filler would want to complete.
  company: z.string().max(200).optional().default(""),
});

const FIELD_LABELS: Record<string, string> = {
  name: "your name",
  email: "your email",
  kidName: "your kid's name",
  kidAge: "your kid's age",
  homeRegion: "your home city or region",
};

/**
 * The browser's `required` attributes catch this first, so a missing field here
 * means a non-browser client. Still worth a sentence a person could act on
 * rather than zod's "expected string, received undefined".
 */
function firstError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Please check the form and try again.";
  const field = FIELD_LABELS[String(issue.path[0])];
  if (issue.code === "invalid_type" || issue.message.startsWith("Invalid input")) {
    return field ? `Please add ${field}.` : "Please check the form and try again.";
  }
  return issue.message;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = ApplicationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
  }

  const data = parsed.data;

  // Silently accept and drop. Telling a bot it was caught only teaches it to
  // leave the field empty next time.
  if (data.company.trim()) return NextResponse.json({ ok: true });

  try {
    const base = getWriteBase();
    await base(APPLICATIONS_TABLE).create([
      {
        fields: {
          Name: data.name,
          Email: data.email,
          "Kid Name": data.kidName,
          "Kid Age": data.kidAge,
          "Home Region": data.homeRegion,
          Notes: data.notes,
          Event: data.event,
          "Submitted At": new Date().toISOString().slice(0, 10),
          Status: "New",
        },
      },
    ]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(
      `[events/apply] write to table "${APPLICATIONS_TABLE}" failed: ${describeAirtableError(err)}`
    );
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
