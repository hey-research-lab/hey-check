import { type CheckResult } from '../hey.js';
import { type CheckInput } from '../input.js';
import {
  CONTRACT_IS_IDENTITY,
  eventsLine,
  humanDay,
  isBuilding,
  lastShipLine,
  namesakeSentence,
  shortAddress,
  statusLabel,
  verificationWords,
} from '../words.js';
import { cardText, type CardModel } from './svg.js';

const host = (url: string): string => url.replace(/^https:\/\//, '').replace(/\/$/, '');

/** What the card says, from HEY's answer. Null when there is nothing to draw (ambiguous). */
export function cardModel(result: CheckResult, input: CheckInput, now: Date): CardModel | null {
  const checkedOn = `Checked ${humanDay(now)} UTC`;
  switch (result.outcome) {
    case 'answered': {
      const { project, builder, contract } = result;
      const facts = [eventsLine(builder.meaningfulEvents30d)];
      if (contract) {
        facts.push(
          `${shortAddress(contract.address)}${contract.verification === 'VERIFIED' ? ` · ${verificationWords('VERIFIED')}` : ''}`,
        );
      }
      return {
        // A name the card's font cannot draw at all (emoji, CJK …) falls back to the slug.
        title: cardText(project.name) ? project.name : project.slug,
        ticker: project.symbol ? `$${project.symbol.replace(/^\$/, '')}` : null,
        pill: {
          label: statusLabel(builder.activityStatus),
          tone: isBuilding(builder.activityStatus) ? 'lime' : 'grey',
        },
        headline: lastShipLine(builder, now),
        detail: result.latestShip?.title ?? null,
        facts,
        notice: null,
        footerUrl: host(result.page),
        checkedOn,
      };
    }
    case 'not_found': {
      if (result.address) {
        const n = result.namesakes?.items[0];
        const others = (result.namesakes?.total ?? 0) - 1;
        return {
          title: shortAddress(result.address),
          ticker: null,
          pill: null,
          headline: 'Not a published project on HEY',
          detail: n
            ? null
            : "HEY holds no published project for this contract. That is a statement about HEY's index, not about the token.",
          facts: [],
          notice: n
            ? {
                heading: 'Same name on another contract',
                body: `${namesakeSentence(n)}${others > 0 ? ` ${others} more published project${others === 1 ? '' : 's'} share it.` : ''}`,
                foot: CONTRACT_IS_IDENTITY,
              }
            : null,
          footerUrl: host(result.scanUrl ?? `https://heyresearch.xyz/scan/${result.address}`),
          checkedOn,
        };
      }
      return {
        title: input.raw,
        ticker: null,
        pill: null,
        headline: 'Not a published project on HEY',
        detail:
          "HEY holds no published project matching that name or ticker. That is a statement about HEY's index, not about the project.",
        facts: [],
        notice: null,
        footerUrl: 'heyresearch.xyz',
        checkedOn,
      };
    }
    case 'ambiguous':
      return null;
  }
}
