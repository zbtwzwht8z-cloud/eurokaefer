'use client';
import { useState } from 'react';
import { ArrowLeft, Check, ExternalLink, Link2, Map as MapIcon, Repeat2, Star } from 'lucide-react';
import type { Chain, Leg } from '@/lib/types';
import { haversineKm } from '@/lib/geo';
import { driveHours, fmtDays, fmtEur, fmtKm, fmtNum, fmtWeekday, fmtWindow, fuelEur } from '@/lib/format';

type Props = {
  chain: Chain;
  legs: Leg[];
  variant: number;
  onVariant: (i: number) => void;
  onBack: () => void;
  isSaved: boolean;
  onToggleSave: () => void;
};

export default function TripDetail({ chain: c, legs, variant, onVariant, onBack, isSaved, onToggleSave }: Props) {
  const [copied, setCopied] = useState(false);
  const v = c.variants[variant];
  const km = legs.reduce((t, l) => t + l.offer.distanceKm, 0);
  const price = legs.reduce((t, l) => t + l.offer.priceEur, 0);
  const allEur1 = legs.every(l => l.offer.priceEur <= 1);

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title: c.key, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* dismissed */ }
  }

  const stops = [legs[0].offer.origin, ...legs.map(l => l.offer.dest)];
  const mapsUrl = 'https://www.google.com/maps/dir/' + stops.map(p => `${p[0]},${p[1]}`).join('/');

  return (
    <article className="detail">
      <div className="detail-top">
        <button className="back" onClick={onBack}><ArrowLeft size={16} aria-hidden /> All trips</button>
        <div className="detail-actions">
          <button className={'icon-btn' + (isSaved ? ' is-on' : '')} onClick={onToggleSave} aria-pressed={isSaved}>
            <Star size={15} strokeWidth={1.8} fill={isSaved ? 'currentColor' : 'none'} aria-hidden />
            {isSaved ? 'Saved' : 'Save'}
          </button>
          <button className="icon-btn" onClick={share}>
            {copied ? <Check size={15} aria-hidden /> : <Link2 size={15} aria-hidden />}
            {copied ? 'Copied' : 'Share'}
          </button>
        </div>
      </div>

      <h1 className="detail-title">
        {c.route.map((city, i) => (
          <span key={i}>{i > 0 && <span className="arrow" aria-hidden> → </span>}{city}</span>
        ))}
      </h1>
      <p className="detail-sub">
        {c.isLoop && <span className="tag"><Repeat2 size={12} strokeWidth={2.2} aria-hidden />Loop</span>}
        {c.loopTier === 'near' && c.loopGapKm != null && <span>ends {Math.round(c.loopGapKm)} km from the start ·</span>}
        <span>{legs.length} {legs.length === 1 ? 'leg' : 'legs'} · departs {fmtWindow(v?.departFrom ?? c.departFrom, v?.departTo ?? c.departTo)}</span>
      </p>

      <dl className="facts">
        <div><dt>Rental</dt><dd className={allEur1 ? 'is-deal' : undefined}>{fmtEur(price)}</dd></div>
        <div><dt>Distance</dt><dd>{fmtKm(km)}</dd></div>
        <div><dt>Trip length</dt><dd>{fmtDays(v?.minDays ?? c.minDays, v?.maxDays ?? c.maxDays)}</dd></div>
        <div><dt>Fuel, est.</dt><dd>~{fmtEur(Math.round(fuelEur(km) / 10) * 10)}</dd></div>
      </dl>

      <h2 className="section-title">Itinerary</h2>
      <ol className="itinerary">
        {legs.map((leg, i) => {
          const o = leg.offer;
          const prevLeg = legs[i - 1];
          const prev = prevLeg?.offer;
          const hop = prev ? haversineKm(prev.dest, o.origin) : 0;
          // Shortest possible wait: take the previous car as late as its
          // window allows, use the full drop-off allowance, then this pickup.
          const waitDays = prevLeg
            ? Math.max(0, leg.pickup - (prevLeg.pickupLatest + prev!.periodHours * 3_600_000)) / 86_400_000
            : 0;
          return (
            <li key={o.id} className="leg">
              {prev && (hop > 2 || waitDays >= 1) && (
                <div className="hop">
                  {waitDays >= 1 && <>At least <b>{Math.floor(waitDays)} {Math.floor(waitDays) === 1 ? 'day' : 'days'}</b> in {prev.destName} before this car is available. </>}
                  {hop > 2 && <>Pickup is {fmtNum(hop)} km away in {o.originTown}, so take a train or bus across.</>}
                </div>
              )}
              <div className="stop">
                <span className="stop-dot" aria-hidden>{i + 1}</span>
                <div>
                  <div className="stop-name">{o.originName}</div>
                  <div className="stop-addr">{[o.originTown !== o.originName && o.originTown, o.originStreet].filter(Boolean).join(' · ')}</div>
                </div>
              </div>
              <div className="leg-body">
                <p className="leg-when">
                  Pick up <b>{fmtWeekday(leg.pickup)}</b>
                  {fmtWeekday(leg.pickupLatest) !== fmtWeekday(leg.pickup) && <> – <b>{fmtWeekday(leg.pickupLatest)}</b></>}
                  , drop off within {o.periodHours} h
                </p>
                <div className="car">
                  {o.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={o.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  )}
                  <div className="car-info">
                    <div className="car-model">{o.model}</div>
                    <div className="car-meta">
                      {[o.brand, o.sleeps ? `sleeps ${o.sleeps}` : null, o.seats ? `${o.seats} seats` : null].filter(Boolean).join(' · ')}
                    </div>
                    <div className="car-meta">
                      {fmtKm(o.distanceKm)} · ~{Math.round(driveHours(o.distanceKm))} h driving · {fmtNum(o.freeKm)} free km
                      {o.extraKmCents ? ` · then €${(o.extraKmCents / 100).toFixed(2)}/km` : ''}
                    </div>
                  </div>
                  <div className={'car-price' + (o.priceEur <= 1 ? ' is-deal' : '')}>{fmtEur(o.priceEur)}</div>
                </div>
                <p className="leg-ref">Movacar ref <code>{o.refkey}</code></p>
              </div>
            </li>
          );
        })}
        <li className="leg is-last">
          <div className="stop">
            <span className="stop-dot" aria-hidden>{legs.length + 1}</span>
            <div>
              <div className="stop-name">{legs[legs.length - 1].offer.destName}</div>
              <div className="stop-addr">
                {[
                  legs[legs.length - 1].offer.destTown !== legs[legs.length - 1].offer.destName && legs[legs.length - 1].offer.destTown,
                  legs[legs.length - 1].offer.destStreet,
                ].filter(Boolean).join(' · ')}
              </div>
            </div>
          </div>
        </li>
      </ol>

      <div className="detail-cta">
        <a className="btn btn-primary" href="https://movacar.com/de-DE/home" target="_blank" rel="noreferrer">
          Book on Movacar <ExternalLink size={14} aria-hidden />
        </a>
        <a className="btn" href={mapsUrl} target="_blank" rel="noreferrer">
          <MapIcon size={14} aria-hidden /> Route in Google Maps
        </a>
      </div>
      <p className="fine">
        Movacar has no links to individual offers. Search the pickup city there and match the ref above.
        Each leg is a separate booking, so grab them in order before someone else does.
      </p>

      {c.variants.length > 1 && (
        <>
          <h2 className="section-title">Other departures <span className="count">{c.variants.length}</span></h2>
          <ul className="variants">
            {c.variants.map((alt, i) => (
              <li key={i}>
                <button className={i === variant ? 'is-on' : undefined} onClick={() => onVariant(i)} aria-pressed={i === variant}>
                  <span>Departs {fmtWindow(alt.departFrom, alt.departTo)}</span>
                  <span className="variant-meta">
                    {fmtDays(alt.minDays, alt.maxDays)} · {fmtEur(alt.priceEur)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </article>
  );
}
