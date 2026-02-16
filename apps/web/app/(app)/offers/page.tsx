'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  useMusicianOffers,
  useRespondOfferToken,
  useRespondToMusicianOffer,
  useUpdateMusicianProfile,
  useVerifyMusicianEmail
} from '@/lib/hooks/use-stageos-data';
import { Panel } from '@/components/ui/panel';

type StaffRole = 'DRUMS' | 'BASS' | 'GUITAR' | 'VOCALS' | 'SOUND' | 'KEYS' | 'PERCUSSION' | 'OTHER';

type Profile = {
  id: string;
  name: string;
  email: string;
  roles: StaffRole[];
  emailVerifiedAt?: string;
  availabilityPrefs?: Record<string, unknown>;
};

type PendingOffer = {
  id: string;
  role: StaffRole;
  expiresAt: string;
  gig: {
    title: string;
    startsAt: string;
    endsAt: string;
    venueName?: string | null;
    address?: string | null;
  };
};

const STAFF_ROLES: StaffRole[] = ['DRUMS', 'BASS', 'GUITAR', 'VOCALS', 'SOUND', 'KEYS', 'PERCUSSION', 'OTHER'];

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function parseProfiles(raw: unknown): Profile[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => asRecord(item))
    .filter((item) => typeof item.id === 'string')
    .map((item) => ({
      id: asString(item.id),
      name: asString(item.name) || 'Musician',
      email: asString(item.email),
      roles: Array.isArray(item.roles)
        ? item.roles.filter((role): role is StaffRole => STAFF_ROLES.includes(role as StaffRole))
        : [],
      emailVerifiedAt: asString(item.emailVerifiedAt) || undefined,
      availabilityPrefs: typeof item.availabilityPrefs === 'object' && item.availabilityPrefs !== null
        ? (item.availabilityPrefs as Record<string, unknown>)
        : undefined
    }));
}

function parsePendingOffers(raw: unknown): PendingOffer[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => asRecord(item))
    .filter((item) => typeof item.id === 'string')
    .map((item) => {
      const gig = asRecord(item.gig);
      return {
        id: asString(item.id),
        role: STAFF_ROLES.includes(item.role as StaffRole) ? (item.role as StaffRole) : 'OTHER',
        expiresAt: asString(item.expiresAt),
        gig: {
          title: asString(gig.title) || 'Untitled gig',
          startsAt: asString(gig.startsAt),
          endsAt: asString(gig.endsAt),
          venueName: asString(gig.venueName) || undefined,
          address: asString(gig.address) || undefined
        }
      } satisfies PendingOffer;
    });
}

export default function OffersPage() {
  const searchParams = useSearchParams();
  const offersQuery = useMusicianOffers();
  const respondAsMusician = useRespondToMusicianOffer();
  const respondToken = useRespondOfferToken();
  const updateProfile = useUpdateMusicianProfile();
  const verifyEmail = useVerifyMusicianEmail();

  const [verifyTokenInput, setVerifyTokenInput] = useState('');
  const [prefNotes, setPrefNotes] = useState('');
  const [roleSet, setRoleSet] = useState<Set<StaffRole>>(new Set());
  const [profileId, setProfileId] = useState<string | undefined>(undefined);
  const [tokenResponseMessage, setTokenResponseMessage] = useState<string | null>(null);

  const payload = asRecord(offersQuery.data);
  const profiles = useMemo(() => parseProfiles(payload.profiles), [payload.profiles]);
  const pendingOffers = useMemo(() => parsePendingOffers(payload.pendingOffers), [payload.pendingOffers]);

  useEffect(() => {
    const profile = profiles[0];
    if (!profile) return;

    setProfileId(profile.id);
    setRoleSet(new Set(profile.roles));
    const existingNotes = typeof profile.availabilityPrefs?.notes === 'string' ? profile.availabilityPrefs.notes : '';
    setPrefNotes(existingNotes);
  }, [profiles]);

  useEffect(() => {
    const verifyToken = searchParams.get('verifyToken');
    if (!verifyToken) return;

    verifyEmail.mutate(verifyToken, {
      onSuccess: () => {
        setTokenResponseMessage('Email verified.');
      },
      onError: (error) => {
        setTokenResponseMessage(error instanceof Error ? error.message : 'Verification failed');
      }
    });
  }, [searchParams, verifyEmail]);

  useEffect(() => {
    const offerToken = searchParams.get('offerToken');
    const decision = searchParams.get('decision');
    if (!offerToken || (decision !== 'YES' && decision !== 'NO')) return;

    respondToken.mutate(
      { token: offerToken, decision },
      {
        onSuccess: (data) => {
          const message = asString(asRecord(data).message) || 'Offer response submitted.';
          setTokenResponseMessage(message);
        },
        onError: (error) => {
          setTokenResponseMessage(error instanceof Error ? error.message : 'Unable to process offer response');
        }
      }
    );
  }, [searchParams, respondToken]);

  const saveProfile = async () => {
    await updateProfile.mutateAsync({
      personId: profileId,
      roles: Array.from(roleSet),
      availabilityPrefs: {
        notes: prefNotes
      }
    });
  };

  return (
    <div className="space-y-4">
      <Panel title="My Offers" subtitle="Accept or decline staffing requests">
        {tokenResponseMessage ? (
          <p className="mb-2 rounded-md border border-cyan-700/40 bg-cyan-900/20 px-3 py-2 text-sm text-cyan-100">
            {tokenResponseMessage}
          </p>
        ) : null}

        {pendingOffers.length === 0 ? (
          <p className="text-sm text-slate-500">No pending offers right now.</p>
        ) : (
          <div className="space-y-2">
            {pendingOffers.map((offer) => (
              <article key={offer.id} className="rounded-md border border-slate-800 bg-slate-950/70 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-100">{offer.role} · {offer.gig.title}</p>
                  <p className="text-xs text-slate-400">Reply by {new Date(offer.expiresAt).toLocaleString()}</p>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {new Date(offer.gig.startsAt).toLocaleString()} - {new Date(offer.gig.endsAt).toLocaleTimeString()} · {offer.gig.venueName ?? 'Venue TBD'}
                </p>
                <p className="mt-1 text-xs text-slate-500">{offer.gig.address ?? 'Address not provided'}</p>

                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="min-h-11 rounded-md bg-emerald-500 px-3 text-sm font-semibold text-slate-950"
                    onClick={() => respondAsMusician.mutate({ attemptId: offer.id, decision: 'YES' })}
                    disabled={respondAsMusician.isPending}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="min-h-11 rounded-md border border-rose-600/60 px-3 text-sm text-rose-100"
                    onClick={() => respondAsMusician.mutate({ attemptId: offer.id, decision: 'NO' })}
                    disabled={respondAsMusician.isPending}
                  >
                    Decline
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Profile" subtitle="Email verification, roles, and availability preferences">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-xs uppercase tracking-[0.14em] text-slate-400">
            Verification Token
            <input
              value={verifyTokenInput}
              onChange={(event) => setVerifyTokenInput(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
              placeholder="Paste verification token"
            />
          </label>
          <button
            type="button"
            className="mt-6 min-h-11 rounded-md border border-slate-700 px-3 text-sm"
            onClick={() => verifyTokenInput && verifyEmail.mutate(verifyTokenInput)}
            disabled={verifyEmail.isPending || verifyTokenInput.trim().length === 0}
          >
            {verifyEmail.isPending ? 'Verifying…' : 'Verify email'}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {STAFF_ROLES.map((role) => (
            <label key={role} className="flex min-h-11 items-center gap-2 rounded-md border border-slate-700 px-3 text-xs">
              <input
                type="checkbox"
                checked={roleSet.has(role)}
                onChange={() =>
                  setRoleSet((current) => {
                    const next = new Set(current);
                    if (next.has(role)) next.delete(role);
                    else next.add(role);
                    return next;
                  })
                }
              />
              {role}
            </label>
          ))}
        </div>

        <label className="mt-3 block text-xs uppercase tracking-[0.14em] text-slate-400">
          General Availability Notes
          <textarea
            value={prefNotes}
            onChange={(event) => setPrefNotes(event.target.value)}
            className="mt-1 min-h-24 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            placeholder="Example: can travel with 24h notice, unavailable Wednesdays"
          />
        </label>

        <button
          type="button"
          className="mt-3 min-h-11 rounded-md bg-cyan-500 px-3 text-sm font-semibold text-slate-950"
          onClick={saveProfile}
          disabled={updateProfile.isPending}
        >
          {updateProfile.isPending ? 'Saving…' : 'Save profile'}
        </button>
      </Panel>
    </div>
  );
}
