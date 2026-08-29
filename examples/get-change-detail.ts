// Read a change with detail (GET /changes/{id} -> ChangeInfo, anonymous) and print a
// colored, Web-UI-style summary using Gerrit's own palette -- the TypeScript twin of the
// Rust, Go, and Python examples. Every value comes from the generated gerrit_client
// models; only the formatting is hand-written.
//
// Gerrit's )]}' XSSI guard is stripped by gerritXssiMiddleware, plugged into the
// Configuration -- the one Gerrit-specific step, and no edit to generated code.
//
//   npx tsx examples/get-change-detail.ts --change 622261
import { ChangesApi, Configuration } from '../src';
import type { ChangeInfo, AccountInfo, CommitInfo, GitPerson, CommonFileInfo } from '../src';
import { gerritXssiMiddleware } from '../xssi';

const OPTIONS = [
  'LABELS', 'DETAILED_ACCOUNTS', 'DETAILED_LABELS', 'CURRENT_REVISION',
  'CURRENT_COMMIT', 'CURRENT_FILES', 'SUBMIT_REQUIREMENTS',
];

type Rgb = [number, number, number];

async function main() {
  const args = process.argv.slice(2);
  let url = 'https://gerrit-review.googlesource.com';
  let change = '621763';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url') url = args[++i];
    else if (args[i] === '--change') change = args[++i];
    else if (args[i] === '--no-color') noColor = true;
  }
  useColor = computeColor();

  const base = url.replace(/\/+$/, '');
  const api = new ChangesApi(new Configuration({ basePath: base, middleware: [gerritXssiMiddleware] }));
  try {
    const ci = await api.getChangesChangeId({ changeId: change, o2: OPTIONS });
    printChangeDetails(base, ci);
  } catch (e) {
    console.error('error:', e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

// ---- presentation -------------------------------------------------------------

function printChangeDetails(base: string, ci: ChangeInfo) {
  console.log(rule());
  console.log(`  ${statusBadge(ci)}  ${sgr('#' + (ci.number ?? 0), BOLD)}`);
  console.log(`  ${sgr(ci.subject ?? '', BOLD)}`);
  console.log(rule());
  console.log(`  ${fg(`${base}/c/${ci.project ?? ''}/+/${ci.number ?? 0}`, BLUE_700)}`);

  section('Change Info');
  row('Owner', account(ci.owner));
  const commit = currentCommit(ci);
  if (commit) {
    row('Author', person(commit.author));
    row('Committer', person(commit.committer));
  }
  row('Repo | Branch', `${link(ci.project ?? '')} | ${link(ci.branch ?? '')}`);
  row('Change-Id', link(ci.changeId ?? ''));
  if (ci.topic) row('Topic', link(ci.topic));
  if (ci.hashtags?.length) row('Hashtags', link(ci.hashtags.join(', ')));
  const flags = flagChips(ci);
  if (flags.length) row('Flags', flags.join('  '));
  row('Strategy', pascal(ci.submitType ?? ''));
  const parent = parentCommit(ci);
  if (parent) row('Parent', link(parent.slice(0, 12)));
  row('Patch set', String(ci.currentRevisionNumber ?? '?'));
  row('Updated', ci.updated ?? '');
  row('Size', plusminus(ci.insertions ?? 0, ci.deletions ?? 0));
  row('Comments', commentsSummary(ci));

  // Reviewers / CC -- one account per line (no comma overflow).
  const reviewers = (ci.reviewers ?? {}) as Record<string, AccountInfo[]>;
  for (const [key, title] of [['REVIEWER', 'Reviewers'], ['CC', 'CC']]) {
    const people = reviewers[key] ?? [];
    if (!people.length) continue;
    section(title);
    for (const a of people) console.log(`    ${account(a)}`);
  }

  if (ci.submitRequirements?.length) {
    section('Submit Requirements');
    for (const r of ci.submitRequirements) {
      const [icon, text] = reqParts(String(r.status ?? ''));
      console.log(`    ${icon} ${(r.name ?? '').padEnd(26)} ${text}`);
    }
  }

  const labels = (ci.labels ?? {}) as Record<string, { all?: Array<{ value?: number; name?: string }> }>;
  if (Object.keys(labels).length) {
    section('Votes');
    for (const name of Object.keys(labels).sort()) {
      const chips = (labels[name].all ?? [])
        .filter((a) => (a.value ?? 0) !== 0) // only non-zero, like the UI aggregate
        .map((a) => voteChip(a.value ?? 0, a.name ?? ''));
      const value = chips.length ? chips.join('  ') : sgr('—', DIM);
      console.log(`    ${name.padEnd(22)} ${value}`);
    }
  }

  const files = currentFiles(ci);
  const paths = Object.keys(files);
  if (paths.length) {
    section(`Files (patch set ${ci.currentRevisionNumber ?? '?'})`);
    // Commit message pseudo-file first, then the rest alphabetically -- like the UI.
    paths.sort((a, b) => (a === '/COMMIT_MSG' ? -1 : b === '/COMMIT_MSG' ? 1 : a.toLowerCase().localeCompare(b.toLowerCase())));
    for (const p of paths) {
      const f = files[p];
      const [letter, color] = fileStatus(f.status);
      const name = p === '/COMMIT_MSG' ? 'Commit message' : f.oldPath ? `${f.oldPath} → ${p}` : p;
      const counts = plusminus(f.linesInserted ?? 0, f.linesDeleted ?? 0);
      console.log(`    ${fg(letter, color)} ${name.padEnd(52)} ${counts}`);
    }
  }

  console.log(rule());
}

// ---- model accessors ----------------------------------------------------------

function currentCommit(ci: ChangeInfo): CommitInfo | undefined {
  const cr = ci.currentRevision;
  const revs = (ci.revisions ?? {}) as Record<string, { commit?: CommitInfo }>;
  return cr ? revs[cr]?.commit : undefined;
}

function currentFiles(ci: ChangeInfo): Record<string, CommonFileInfo> {
  const cr = ci.currentRevision;
  const revs = (ci.revisions ?? {}) as Record<string, { files?: Record<string, CommonFileInfo> }>;
  return (cr ? revs[cr]?.files : undefined) ?? {};
}

function parentCommit(ci: ChangeInfo): string {
  const commit = currentCommit(ci);
  return commit?.parents?.[0]?.commit ?? '';
}

function account(a?: AccountInfo): string {
  if (!a) return '—';
  if (a.name && a.email) return named(a.name, a.email);
  if (a.name) return sgr(a.name, BOLD);
  return a.accountId ? `account #${a.accountId}` : '—';
}

function person(p?: GitPerson): string {
  if (!p || (!p.name && !p.email)) return '—';
  return named(p.name ?? '', p.email ?? '');
}

// Bold name, dim <email>. No blue -- reserve blue for links.
function named(name: string, email: string): string {
  return `${sgr(name, BOLD)} ${sgr('<' + email + '>', DIM)}`;
}

function flagChips(ci: ChangeInfo): string[] {
  const f: string[] = [];
  if (ci.workInProgress) f.push(chip(' WIP ', WHITE, WIP_BROWN));
  if (ci.isPrivate) f.push(chip(' Private ', WHITE, PURPLE_500));
  if (ci.mergeable) f.push(fg('mergeable', GREEN_700));
  if (ci.submittable) f.push(fg('submittable', GREEN_700));
  return f;
}

function commentsSummary(ci: ChangeInfo): string {
  const total = ci.totalCommentCount ?? 0;
  const unresolved = ci.unresolvedCommentCount ?? 0;
  const resolved = Math.max(total - unresolved, 0);
  const openColor = unresolved > 0 ? RED_600 : GREEN_700;
  return `${total} total  (${fg(`${resolved} resolved`, GREEN_700)}, ${fg(`${unresolved} unresolved`, openColor)})`;
}

// NOT_APPLICABLE -> NotApplicable, MERGE_IF_NECESSARY -> MergeIfNecessary.
function pascal(s: string): string {
  return s.split('_').map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('');
}

// ---- color / styling ----------------------------------------------------------
// Zero-dependency ANSI, disabled when stdout is not a TTY, on NO_COLOR, or --no-color.

let useColor = false;
let noColor = false;
const BOLD = '1';
const DIM = '2';

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];
// Borrowed verbatim from Gerrit's Web UI theme (polygerrit-ui app-theme.ts).
const GRAY_700: Rgb = [95, 99, 104];    // --status-merged / --status-abandoned / modified
const YELLOW_700: Rgb = [242, 153, 0];  // --status-active (black text)
const WIP_BROWN: Rgb = [121, 85, 72];   // --status-wip
const PURPLE_500: Rgb = [161, 66, 244]; // --status-private / rewrite files
const GREEN_700: Rgb = [24, 128, 56];   // --status-ready / satisfied / additions
const GREEN_300: Rgb = [129, 201, 149]; // --vote-color-approved chip bg
const RED_300: Rgb = [242, 139, 130];   // --vote-color-rejected chip bg
const RED_600: Rgb = [217, 48, 37];     // --status-conflict / deletions
const BLUE_700: Rgb = [25, 103, 210];   // links / renamed files
const HEADER_INDIGO: Rgb = [62, 78, 138]; // Gerrit top-bar background, used for rules

function computeColor(): boolean {
  if (noColor || process.env.NO_COLOR) return false;
  if (process.env.CLICOLOR_FORCE) return true; // force through a pipe
  return Boolean(process.stdout.isTTY);
}

function sgr(s: string, code: string): string {
  return useColor ? `\x1b[${code}m${s}\x1b[0m` : s;
}

function fg(s: string, [r, g, b]: Rgb): string {
  return useColor ? `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m` : s;
}

function chip(s: string, [fr, fgc, fb]: Rgb, [br, bgc, bb]: Rgb): string {
  return useColor ? `\x1b[38;2;${fr};${fgc};${fb};48;2;${br};${bgc};${bb}m${s}\x1b[0m` : s;
}

function link(s: string): string {
  return fg(s, BLUE_700);
}

function rule(): string {
  return fg('─'.repeat(76), HEADER_INDIGO);
}

function section(title: string) {
  console.log();
  console.log(`  ${sgr(title.toUpperCase(), BOLD)}`);
}

function row(label: string, value: string) {
  // Pad the visible label to width BEFORE coloring -- ANSI escape bytes would otherwise
  // be counted by padEnd and break column alignment when color is on.
  console.log(`    ${sgr(label.padEnd(14), DIM)}${value}`);
}

function statusBadge(ci: ChangeInfo): string {
  // Derive the display state the way gr-change-status does: the raw REST status is only
  // NEW/MERGED/ABANDONED, but an open change reads WIP or Private when those flags are
  // set, otherwise "Active".
  const raw = String(ci.status ?? '').toUpperCase();
  let label: string, fgC: Rgb, bg: Rgb;
  if (raw === 'MERGED') [label, fgC, bg] = ['Merged', WHITE, GRAY_700];
  else if (raw === 'ABANDONED') [label, fgC, bg] = ['Abandoned', WHITE, GRAY_700];
  else if (ci.workInProgress) [label, fgC, bg] = ['WIP', WHITE, WIP_BROWN];
  else if (ci.isPrivate) [label, fgC, bg] = ['Private', WHITE, PURPLE_500];
  else [label, fgC, bg] = ['Active', BLACK, YELLOW_700];
  return chip(` ${label} `, fgC, bg);
}

function voteChip(v: number, who: string): string {
  const bg = v > 0 ? GREEN_300 : RED_300;
  const sign = v > 0 ? `+${v}` : `${v}`;
  return `${chip(` ${sign} `, BLACK, bg)} ${who}`;
}

function plusminus(ins: number, del: number): string {
  return `${fg(`+${ins}`, GREEN_700)} ${fg(`-${del}`, RED_600)}`;
}

function reqParts(status: string): [string, string] {
  const display = status ? pascal(status) : '';
  if (status === 'SATISFIED') return [fg('✓', GREEN_700), fg(display, GREEN_700)];
  if (status === 'UNSATISFIED') return [fg('✗', RED_600), fg(display, RED_600)];
  return [sgr('○', DIM), sgr(display, DIM)]; // NOT_APPLICABLE and others
}

function fileStatus(s?: string): [string, Rgb] {
  switch (s) {
    case 'A': return ['A', GREEN_700];  // added
    case 'D': return ['D', RED_600];    // deleted
    case 'R': return ['R', BLUE_700];   // renamed
    case 'C': return ['C', BLUE_700];   // copied
    case 'W': return ['W', PURPLE_500]; // rewrite
    default: return ['M', GRAY_700];    // modified
  }
}

main();
