const SESSION_BLUEPRINTS = [
  {
    id: 'mixed-pm-thread',
    title: 'Mixed PM + Design Thread',
    note: 'Alternates short replies with dense planning bursts and occasional code-ish snippets.',
    pattern: 'mixed',
    baseCount: 280,
    startTime: Date.UTC(2026, 1, 10, 16, 0, 0),
    participants: [
      { role: 'human', name: 'Maya' },
      { role: 'assistant', name: 'Atlas' },
      { role: 'system', name: 'System' },
    ],
  },
  {
    id: 'support-firehose',
    title: 'Support Firehose',
    note: 'Lots of terse status lines, pasted traces, and repeated resize-sensitive blobs.',
    pattern: 'support',
    baseCount: 420,
    startTime: Date.UTC(2026, 1, 12, 18, 30, 0),
    participants: [
      { role: 'operator', name: 'Nora' },
      { role: 'assistant', name: 'Relay' },
      { role: 'system', name: 'Dispatch' },
      { role: 'tool', name: 'Indexer' },
    ],
  },
  {
    id: 'multilingual-lab',
    title: 'Multilingual Research Lab',
    note: 'Longer prose, multilingual fragments, emoji, and reflective follow-ups.',
    pattern: 'multilingual',
    baseCount: 560,
    startTime: Date.UTC(2026, 1, 15, 20, 15, 0),
    participants: [
      { role: 'researcher', name: 'Lucia' },
      { role: 'assistant', name: 'Orchid' },
      { role: 'reviewer', name: 'Kenji' },
      { role: 'system', name: 'System' },
    ],
  },
];

const SHORT_LINES = [
  'Yep.',
  'Still reading.',
  'Scroll jumped again at the exact moment the long answer landed.',
  'That was smoother.',
  'Can you pin the anchor to the first fully visible row?',
  'Need a clearer metric for over-estimation.',
  'I only trust this if the resize path stays honest.',
  'Looks okay on desktop, shakier on narrow widths.',
  'Queueing another replay with denser text.',
  'The code block is the stress case.',
];

const LONG_PROSE = [
  'What I care about here is not just throughput but predictability. In a long-lived chat thread, one bad estimate can ripple into visible scroll drift because the viewport is effectively balancing on a stack of guesses. That means an approach can be fast and still feel wrong if the anchor is unstable.',
  'We should separate two questions. First: can the estimation path cheaply predict row height before a row ever mounts? Second: when the prediction is wrong, does the correction stay visually calm enough that users do not lose their place? Those are related, but they are not the same problem.',
  'A browser-native layout still wins whenever the full DOM is cheap enough to keep around and the interaction surface is simple. The value proposition only sharpens once the thread becomes long enough that virtualization, occlusion, or speculative layout become mandatory rather than optional.',
  'The interesting part about chat UIs is that they combine soft wraps, timestamps, sender chrome, and repeated width changes. A measurement system that only looks good on isolated paragraphs but falls apart during resize or late image insertion is not buying much in practice.',
];

const MULTILINGUAL = [
  '春の入力では改行の位置が読みやすさを大きく変えるので、推定高さが少しずれるだけでも体感が変わります。',
  'التحدي هنا ليس القياس فقط، بل الحفاظ على موضع القراءة عندما تتغير التقديرات أثناء التمرير الطويل.',
  'La medida previa ayuda cuando el mensaje todavía no ha tocado el DOM, pero después de la corrección real ambas rutas deberían converger.',
  'Une interface honnête doit montrer quand l’estimation gagne du temps et quand elle n’apporte presque rien.',
  '읽기 흐름이 깨지지 않는지가 핵심입니다. 빠르기만 하고 앵커가 흔들리면 긴 대화에서는 바로 티가 납니다.',
];

const EMOJI_LINES = [
  '👀 Watching the anchor delta after a 620px -> 420px resize.',
  '🧪 Stress pass: mixed prose + pasted stack trace + emoji + CJK.',
  '✅ First impression: estimates are calmer in the canvas path.',
  '😬 The browser lane still wins for perfect fidelity once rows mount.',
  '📎 Pasted another block below; scroll stayed anchored this time.',
];

const CODEISH = [
  [
    'function replaySession(sessionId) {',
    '  const rows = hydrateVirtualRows(sessionId);',
    '  return rows.filter(row => row.visible).map(row => row.id);',
    '}',
  ].join('\n'),
  [
    'if (anchorChanged && Math.abs(deltaPx) > 1) {',
    '  viewport.scrollTop += deltaPx;',
    "  metrics.lastReason = 'measurement-correction';",
    '}',
  ].join('\n'),
  [
    'SELECT timestamp, sender_role, char_count',
    'FROM chat_messages',
    "WHERE session_id = 'support-firehose'",
    'ORDER BY timestamp ASC;',
  ].join('\n'),
  [
    'Traceback (most recent call last):',
    '  File "pipeline.py", line 81, in measure_batch',
    "    raise ValueError('wrap width collapsed to zero')",
    'ValueError: wrap width collapsed to zero',
  ].join('\n'),
];

const SYSTEM_NOTES = [
  'System note: baseline mode uses a rough browser-style estimate before rows mount; the assisted lane uses cached canvas segmentation and width-aware relayout.',
  'System note: once actual DOM measurements arrive, both lanes use the measured height for future virtualization math.',
  'System note: the goal here is scroll stability and predictability, not replacing native layout after render.',
];

function mulberry32(seed) {
  let state = seed >>> 0;

  return function next() {
    state += 0x6d2b79f5;
    let result = Math.imul(state ^ (state >>> 15), state | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, values) {
  return values[Math.floor(rng() * values.length)];
}

function weightedKind(rng, pattern, lineLengthMix) {
  const longBias = lineLengthMix / 100;
  const table =
    pattern === 'support'
      ? [
          ['short', 0.34 - longBias * 0.06],
          ['code', 0.24],
          ['system', 0.1],
          ['prose', 0.18 + longBias * 0.1],
          ['emoji', 0.06],
          ['multi', 0.08],
        ]
      : pattern === 'multilingual'
        ? [
            ['short', 0.12],
            ['code', 0.08],
            ['system', 0.08],
            ['prose', 0.34 + longBias * 0.12],
            ['emoji', 0.08],
            ['multi', 0.3 - longBias * 0.06],
          ]
        : [
            ['short', 0.24 - longBias * 0.08],
            ['code', 0.14],
            ['system', 0.1],
            ['prose', 0.3 + longBias * 0.12],
            ['emoji', 0.1],
            ['multi', 0.12],
          ];

  const roll = rng();
  let cursor = 0;

  for (const [kind, weight] of table) {
    cursor += weight;
    if (roll <= cursor) {
      return kind;
    }
  }

  return table[table.length - 1][0];
}

function expandText(base, rng, lineLengthMix) {
  const extraParagraphs = lineLengthMix > 66 ? 2 : lineLengthMix > 38 ? 1 : 0;
  let text = base;

  for (let index = 0; index < extraParagraphs; index += 1) {
    text += `\n\n${pick(rng, LONG_PROSE)}`;
  }

  if (lineLengthMix > 75 && rng() > 0.7) {
    text += `\n\n${pick(rng, MULTILINGUAL)}`;
  }

  return text;
}

function createMessageContent(kind, rng, lineLengthMix) {
  if (kind === 'short') {
    return pick(rng, SHORT_LINES);
  }

  if (kind === 'code') {
    const base = pick(rng, CODEISH);
    return lineLengthMix > 55 ? `${base}\n\n${pick(rng, SHORT_LINES)}` : base;
  }

  if (kind === 'multi') {
    return expandText(pick(rng, MULTILINGUAL), rng, lineLengthMix);
  }

  if (kind === 'emoji') {
    return `${pick(rng, EMOJI_LINES)}\n${pick(rng, SHORT_LINES)}`;
  }

  if (kind === 'system') {
    return pick(rng, SYSTEM_NOTES);
  }

  return expandText(pick(rng, LONG_PROSE), rng, lineLengthMix);
}

function messageIncrementMinutes(rng, pattern) {
  const base = pattern === 'support' ? 1 : pattern === 'multilingual' ? 4 : 2;
  return base + Math.floor(rng() * (pattern === 'support' ? 6 : 11));
}

function senderForIndex(session, index, rng) {
  if (index % 27 === 0) {
    return session.participants.find(participant => participant.role === 'system') ?? session.participants[0];
  }

  if (session.pattern === 'support' && index % 8 === 0) {
    return session.participants.find(participant => participant.role === 'tool') ?? session.participants[0];
  }

  return session.participants[Math.floor(rng() * session.participants.length)];
}

function describeTranscript(messages) {
  let codeCount = 0;
  let multilingualCount = 0;

  for (const message of messages) {
    if (message.text.includes('\n') || message.text.includes('Traceback')) {
      codeCount += 1;
    }

    if (/[一-龯ぁ-ゔア-ヴー々〆〤가-힣ء-ي]/u.test(message.text)) {
      multilingualCount += 1;
    }
  }

  return {
    codeCount,
    multilingualCount,
    totalCharacters: messages.reduce((sum, message) => sum + message.text.length, 0),
  };
}

export function generateSessions({ lineLengthMix, sessionScale }) {
  return SESSION_BLUEPRINTS.map((session, blueprintIndex) => {
    const rng = mulberry32(1000 + blueprintIndex * 7919 + Math.round(lineLengthMix * 13) + Math.round(sessionScale * 17));
    const messageCount = Math.max(90, Math.round(session.baseCount * sessionScale));
    const messages = [];
    let nextTimestamp = session.startTime;

    for (let index = 0; index < messageCount; index += 1) {
      const sender = senderForIndex(session, index, rng);
      const kind = sender.role === 'system' ? 'system' : weightedKind(rng, session.pattern, lineLengthMix);

      messages.push({
        id: `${session.id}-${index + 1}`,
        senderRole: sender.role,
        senderName: sender.name,
        timestamp: new Date(nextTimestamp).toISOString(),
        text: createMessageContent(kind, rng, lineLengthMix),
      });

      nextTimestamp += messageIncrementMinutes(rng, session.pattern) * 60_000;
    }

    return {
      ...session,
      messages,
      stats: describeTranscript(messages),
    };
  });
}
