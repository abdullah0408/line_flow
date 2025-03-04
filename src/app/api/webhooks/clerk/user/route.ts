import { Webhook } from "svix";
import { headers } from "next/headers";
import { WebhookEvent } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  const CLERK_USER_SIGNING_SECRET = process.env.CLERK_USER_SIGNING_SECRET;

  if (!CLERK_USER_SIGNING_SECRET) {
    throw new Error(
      "Error: Please add SIGNING_SECRET from Clerk Dashboard to .env or .env.local"
    );
  }

  // Create new Svix instance with secret
  const wh = new Webhook(CLERK_USER_SIGNING_SECRET);

  // Get headers
  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Error: Missing Svix headers", {
      status: 400,
    });
  }

  // Get body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  let evt: WebhookEvent;

  // Verify payload with headers
  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("Error: Could not verify webhook:", err);
    return new Response("Error: Verification error", {
      status: 400,
    });
  }

  const eventType = evt.type;

  // Handle user created event
  if (eventType === "user.created") {
    const data = evt.data;
    const firstName = data.first_name || "";
    const lastName = data.last_name || "";
    const name =
      `${firstName} ${lastName}`.trim() ||
      data.email_addresses[0].email_address;
    await prisma.user.create({
      data: {
        id: data.id,
        email: data.email_addresses[0].email_address,
        name,
        profileImage: data.image_url,
      },
    });
  }

  // Handle user updated event
  if (eventType === "user.updated") {
    const data = evt.data;
    const firstName = data.first_name || "";
    const lastName = data.last_name || "";
    const name =
      `${firstName} ${lastName}`.trim() ||
      data.email_addresses[0].email_address;
    await prisma.user.update({
      where: {
        id: data.id,
      },
      data: {
        email: data.email_addresses[0].email_address,
        name,
        profileImage: data.image_url,
      },
    });
  }

  // Handle user deleted event
  if (eventType === "user.deleted") {
    const data = evt.data;
    await prisma.user.delete({
      where: {
        id: data.id,
      },
    });
  }

  return new Response("Webhook received", { status: 200 });
}
