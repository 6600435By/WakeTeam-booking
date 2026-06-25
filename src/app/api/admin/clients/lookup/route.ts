import { NextRequest, NextResponse } from "next/server";
import {
  handleAdminError,
  requireAdminContext,
  resolveBranchFilter,
} from "@/lib/admin-access";
import {
  findClientsByPhoneSearch,
  type ClientLookupRow,
} from "@/lib/clients/find-by-phone";
import { JOURNAL_HIDDEN_STATUSES } from "@/lib/appointment-status";
import { prisma } from "@/lib/db";
import { isSearchablePhone } from "@/lib/phone";

const appointmentSelect = {
  id: true,
  publicNumber: true,
  startAt: true,
  endAt: true,
  status: true,
  price: true,
  durationMinutes: true,
  comment: true,
  membershipId: true,
  branchId: true,
  cancelReason: true,
  client: {
    select: { firstName: true, lastName: true, phone: true },
  },
  service: { select: { id: true, name: true } },
  staff: { select: { id: true, name: true } },
} as const;

async function appointmentsForClient(
  organizationId: string,
  client: ClientLookupRow,
  branchId: string | null,
) {
  const now = new Date();
  const hidden = JOURNAL_HIDDEN_STATUSES as readonly string[];

  const appointments = await prisma.appointment.findMany({
    where: {
      clientId: client.id,
      organizationId,
      ...(branchId ? { branchId } : {}),
    },
    select: appointmentSelect,
    orderBy: { startAt: "desc" },
    take: 80,
  });

  const upcoming = appointments
    .filter((a) => a.startAt >= now && !hidden.includes(a.status))
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  const history = appointments.filter(
    (a) => a.startAt < now || hidden.includes(a.status),
  );

  return { upcoming, history };
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    const phoneRaw = req.nextUrl.searchParams.get("phone");
    if (!phoneRaw?.trim()) {
      return NextResponse.json({
        client: null,
        clients: [],
        upcoming: [],
        history: [],
      });
    }

    if (!isSearchablePhone(phoneRaw.trim())) {
      return NextResponse.json({
        client: null,
        clients: [],
        upcoming: [],
        history: [],
      });
    }

    const branchId = resolveBranchFilter(
      ctx,
      req.nextUrl.searchParams.get("branchId"),
    );

    const clients = await findClientsByPhoneSearch(
      ctx.organizationId,
      phoneRaw.trim(),
    );

    if (clients.length === 0) {
      return NextResponse.json({
        client: null,
        clients: [],
        upcoming: [],
        history: [],
      });
    }

    const clientIdParam = req.nextUrl.searchParams.get("clientId");
    let selected: ClientLookupRow | null = null;

    if (clientIdParam) {
      selected = clients.find((c) => c.id === clientIdParam) ?? null;
    } else if (clients.length === 1) {
      selected = clients[0];
    }

    if (!selected) {
      return NextResponse.json({
        client: null,
        clients,
        multiple: clients.length > 1,
        upcoming: [],
        history: [],
      });
    }

    const { upcoming, history } = await appointmentsForClient(
      ctx.organizationId,
      selected,
      branchId ?? null,
    );

    return NextResponse.json({
      client: selected,
      clients,
      multiple: clients.length > 1,
      upcoming,
      history,
    });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
