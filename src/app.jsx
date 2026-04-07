import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { generateSessions } from './session-data.js';
import { getRuntimeStats, layout, prepare, resetRuntimeStats } from './pretext-runtime.js';

const FONT_SIZE = 14;
const FONT_FAMILY = '"Helvetica Neue", Arial, sans-serif';
const TIMESTAMP_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function binarySearchOffset(offsets, heights, value) {
  let low = 0;
  let high = offsets.length - 1;
  let answer = 0;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);

    if (offsets[middle] + heights[middle] >= value) {
      answer = middle;
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }

  return answer;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function computeRoughLineCount(text, contentWidth, lineHeight) {
  const approxCharsPerLine = Math.max(8, Math.floor(contentWidth / (FONT_SIZE * 0.58)));
  const lines = text.split('\n');
  let lineCount = 0;

  for (const line of lines) {
    if (!line) {
      lineCount += 1;
      continue;
    }

    let weightedLength = 0;
    for (const char of line) {
      if (char === ' ') {
        weightedLength += 0.38;
      } else if (/[一-龯ぁ-ゔア-ヴー々〆〤가-힣ء-ي]/u.test(char)) {
        weightedLength += 1.75;
      } else if (/\p{Extended_Pictographic}/u.test(char)) {
        weightedLength += 1.9;
      } else {
        weightedLength += 1;
      }
    }

    lineCount += Math.max(1, Math.ceil(weightedLength / approxCharsPerLine));
  }

  return Math.max(1, lineCount) * lineHeight;
}

function formatTimestamp(timestamp) {
  return TIMESTAMP_FORMATTER.format(new Date(timestamp));
}

function getRowEstimate(message, mode, contentWidth, density) {
  const lineHeight = Math.round(20 * density);
  const headerHeight = Math.round(28 * density);
  const bubbleChrome = Math.round(26 * density);
  const contentHeight =
    mode === 'pretext-assisted'
      ? layout(prepare(message.text, `${FONT_SIZE}px ${FONT_FAMILY}`, { whiteSpace: 'pre-wrap' }), contentWidth, lineHeight).height
      : computeRoughLineCount(message.text, contentWidth, lineHeight);

  return headerHeight + bubbleChrome + contentHeight;
}

function summarizeErrors(messages, measuredHeights, estimates) {
  let measuredRows = 0;
  let totalAbsError = 0;
  let maxError = 0;

  for (let index = 0; index < messages.length; index += 1) {
    const measured = measuredHeights[messages[index].id];
    if (measured == null) {
      continue;
    }

    measuredRows += 1;
    const delta = Math.abs(measured - estimates[index]);
    totalAbsError += delta;
    maxError = Math.max(maxError, delta);
  }

  return {
    measuredRows,
    averageAbsError: measuredRows > 0 ? totalAbsError / measuredRows : 0,
    maxError,
  };
}

function SessionList({ sessions, selectedSessionId }) {
  const navigate = useNavigate();

  return (
    <aside className="left-column">
      <div className="column-header">
        <p className="eyebrow">Sessions</p>
        <h2>Seeded transcripts</h2>
      </div>
      <div className="session-list">
        {sessions.map(session => (
          <button
            key={session.id}
            className={session.id === selectedSessionId ? 'session-card is-selected' : 'session-card'}
            type="button"
            onClick={() => navigate(`/${session.id}`)}
          >
            <span className="session-title">{session.title}</span>
            <span className="session-note">{session.note}</span>
            <span className="session-meta">
              {session.messages.length} rows · {session.stats.codeCount} blocky · {session.stats.multilingualCount} multilingual
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function Controls({ mode, setMode, stress, setStress }) {
  return (
    <section className="controls-card">
      <div className="control-row">
        <div>
          <p className="eyebrow">Mode</p>
          <div className="mode-toggle">
            <button
              type="button"
              className={mode === 'baseline' ? 'toggle-pill is-active' : 'toggle-pill'}
              onClick={() => setMode('baseline')}
            >
              Baseline estimate
            </button>
            <button
              type="button"
              className={mode === 'pretext-assisted' ? 'toggle-pill is-active' : 'toggle-pill'}
              onClick={() => setMode('pretext-assisted')}
            >
              Pretext-assisted estimate
            </button>
          </div>
        </div>
        <p className="control-note">
          Baseline stays browser-native enough to be blunt: it guesses from character count. The assisted lane uses the real
          `@chenglou/pretext` `prepare/layout` path before rows mount.
        </p>
      </div>

      <div className="sliders">
        <label className="slider-field">
          <span>Viewport width</span>
          <input
            type="range"
            min="360"
            max="980"
            step="10"
            value={stress.viewportWidth}
            onChange={event => setStress(current => ({ ...current, viewportWidth: Number(event.target.value) }))}
          />
          <strong>{stress.viewportWidth}px</strong>
        </label>

        <label className="slider-field">
          <span>Density</span>
          <input
            type="range"
            min="85"
            max="140"
            step="1"
            value={Math.round(stress.density * 100)}
            onChange={event => setStress(current => ({ ...current, density: Number(event.target.value) / 100 }))}
          />
          <strong>{stress.density.toFixed(2)}x</strong>
        </label>

        <label className="slider-field">
          <span>Line length mix</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={stress.lineLengthMix}
            onChange={event => setStress(current => ({ ...current, lineLengthMix: Number(event.target.value) }))}
          />
          <strong>{stress.lineLengthMix}% long</strong>
        </label>

        <label className="slider-field">
          <span>Session size</span>
          <input
            type="range"
            min="60"
            max="200"
            step="10"
            value={Math.round(stress.sessionScale * 100)}
            onChange={event => setStress(current => ({ ...current, sessionScale: Number(event.target.value) / 100 }))}
          />
          <strong>{stress.sessionScale.toFixed(1)}x</strong>
        </label>
      </div>
    </section>
  );
}

function InstrumentPanel({ metrics, session }) {
  return (
    <aside className="right-column">
      <div className="column-header">
        <p className="eyebrow">Instrumentation</p>
        <h2>What the viewport is doing</h2>
      </div>

      <div className="metric-grid">
        <Metric label="Visible rows" value={metrics.visibleRows} />
        <Metric label="Measured rows" value={metrics.measuredRows} />
        <Metric label="Measurements" value={metrics.measurementCount} />
        <Metric label="Scroll top" value={`${Math.round(metrics.scrollTop)}px`} />
        <Metric label="Average error" value={`${metrics.averageAbsError.toFixed(1)}px`} />
        <Metric label="Max error" value={`${metrics.maxError.toFixed(1)}px`} />
        <Metric label="Anchor nudges" value={metrics.anchorCorrectionCount} />
        <Metric label="Anchor pixels" value={`${Math.round(metrics.anchorCorrectionPixels)}px`} />
      </div>

      <div className="detail-card">
        <h3>Estimator runtime</h3>
        <dl className="detail-list">
          <div>
            <dt>`prepare()` calls</dt>
            <dd>{metrics.runtime.prepareCalls}</dd>
          </div>
          <div>
            <dt>Cache hits</dt>
            <dd>{metrics.runtime.prepareHits}</dd>
          </div>
          <div>
            <dt>`layout()` calls</dt>
            <dd>{metrics.runtime.layoutCalls}</dd>
          </div>
          <div>
            <dt>Prepared cache</dt>
            <dd>{metrics.runtime.cacheSize}</dd>
          </div>
          <div>
            <dt>Total height</dt>
            <dd>{Math.round(metrics.totalHeight)}px</dd>
          </div>
          <div>
            <dt>Viewport width</dt>
            <dd>{metrics.viewportWidth}px</dd>
          </div>
        </dl>
      </div>

      <div className="detail-card">
        <h3>Honest read</h3>
        <p>
          The assisted lane mostly helps before a row mounts and during width changes. After actual DOM measurements land, both
          lanes converge because the viewport switches to measured heights.
        </p>
        <p>
          Runtime counters shown here come from a thin local wrapper, but the measurement and layout work itself is running
          through the actual `@chenglou/pretext` package.
        </p>
      </div>

      <div className="detail-card">
        <h3>Selected session</h3>
        <p>{session.note}</p>
        <p>
          {session.messages.length} messages, {session.stats.totalCharacters.toLocaleString()} characters, {session.stats.codeCount}{' '}
          block-heavy rows.
        </p>
      </div>
    </aside>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MessageRow({ message, top, width, density, onMeasure }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return undefined;
    }

    const commitMeasurement = () => {
      onMeasure(message.id, element.getBoundingClientRect().height);
    };

    commitMeasurement();

    const observer = new ResizeObserver(() => {
      commitMeasurement();
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [message.id, onMeasure]);

  return (
    <article className="message-row" style={{ top, width }}>
      <div ref={ref} className={`bubble bubble-${message.senderRole}`} style={{ '--density': density }}>
        <header className="bubble-header">
          <strong>{message.senderName}</strong>
          <span>{message.senderRole}</span>
          <time>{formatTimestamp(message.timestamp)}</time>
        </header>
        <pre className="bubble-body">{message.text}</pre>
      </div>
    </article>
  );
}

function ChatViewport({ messages, mode, viewportWidth, density, onMetricsChange }) {
  const containerRef = useRef(null);
  const anchorRef = useRef({ index: 0, offset: 0 });
  const changeReasonRef = useRef('initial');
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(620);
  const [measuredHeights, setMeasuredHeights] = useState({});
  const [measurementCount, setMeasurementCount] = useState(0);
  const [anchorCorrectionCount, setAnchorCorrectionCount] = useState(0);
  const [anchorCorrectionPixels, setAnchorCorrectionPixels] = useState(0);

  const contentWidth = Math.max(180, viewportWidth - 132);

  useEffect(() => {
    resetRuntimeStats();
    setMeasuredHeights({});
    setMeasurementCount(0);
    setAnchorCorrectionCount(0);
    setAnchorCorrectionPixels(0);
    setScrollTop(0);
    changeReasonRef.current = 'session-change';
  }, [messages]);

  useEffect(() => {
    changeReasonRef.current = 'mode-or-stress-change';
  }, [mode, viewportWidth, density]);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return undefined;
    }

    const commit = () => setViewportHeight(element.clientHeight);
    commit();

    const observer = new ResizeObserver(() => commit());
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const estimates = useMemo(
    () => messages.map(message => getRowEstimate(message, mode, contentWidth, density)),
    [messages, mode, contentWidth, density],
  );

  const heights = useMemo(
    () => messages.map((message, index) => measuredHeights[message.id] ?? estimates[index]),
    [messages, measuredHeights, estimates],
  );

  const offsets = useMemo(() => {
    const next = new Array(messages.length);
    let cursor = 0;

    for (let index = 0; index < messages.length; index += 1) {
      next[index] = cursor;
      cursor += heights[index];
    }

    return next;
  }, [messages.length, heights]);

  const totalHeight = offsets.length === 0 ? 0 : offsets[offsets.length - 1] + heights[heights.length - 1];
  const firstVisible = messages.length === 0 ? 0 : binarySearchOffset(offsets, heights, scrollTop);
  const startIndex = clamp(firstVisible - 8, 0, Math.max(0, messages.length - 1));
  let endIndex = startIndex;

  while (endIndex < messages.length && offsets[endIndex] < scrollTop + viewportHeight + 900) {
    endIndex += 1;
  }

  const visibleRows = messages.slice(startIndex, Math.min(messages.length, endIndex + 4));

  useLayoutEffect(() => {
    const element = containerRef.current;
    const anchor = anchorRef.current;

    if (!element || !messages.length || anchor.index >= messages.length) {
      return;
    }

    const targetScrollTop = offsets[anchor.index] + anchor.offset;
    const delta = targetScrollTop - element.scrollTop;

    if (Math.abs(delta) > 1) {
      element.scrollTop = targetScrollTop;
      setScrollTop(targetScrollTop);
      setAnchorCorrectionCount(count => count + 1);
      setAnchorCorrectionPixels(value => value + Math.abs(delta));
    }
  }, [offsets, heights, messages.length]);

  useEffect(() => {
    const runtime = getRuntimeStats();
    const errorSummary = summarizeErrors(messages, measuredHeights, estimates);

    onMetricsChange({
      visibleRows: visibleRows.length,
      measuredRows: errorSummary.measuredRows,
      measurementCount,
      scrollTop,
      totalHeight,
      averageAbsError: errorSummary.averageAbsError,
      maxError: errorSummary.maxError,
      anchorCorrectionCount,
      anchorCorrectionPixels,
      runtime,
      viewportWidth,
    });
  }, [
    anchorCorrectionCount,
    anchorCorrectionPixels,
    estimates,
    measurementCount,
    measuredHeights,
    messages,
    onMetricsChange,
    scrollTop,
    totalHeight,
    viewportWidth,
    visibleRows.length,
  ]);

  function handleScroll(event) {
    const nextScrollTop = event.currentTarget.scrollTop;
    const anchorIndex = messages.length === 0 ? 0 : binarySearchOffset(offsets, heights, nextScrollTop);

    anchorRef.current = {
      index: anchorIndex,
      offset: nextScrollTop - (offsets[anchorIndex] ?? 0),
    };

    setScrollTop(nextScrollTop);
  }

  function handleMeasure(messageId, height) {
    changeReasonRef.current = 'actual-measurement';
    setMeasuredHeights(current => {
      if (Math.abs((current[messageId] ?? 0) - height) < 1) {
        return current;
      }

      setMeasurementCount(value => value + 1);
      return { ...current, [messageId]: height };
    });
  }

  return (
    <section className="viewport-card">
      <div className="viewport-labels">
        <p className="eyebrow">Scrollable transcript</p>
        <span>{mode === 'baseline' ? 'Rough browser-style estimate' : 'Actual Pretext prepare/layout estimate'}</span>
      </div>
      <div ref={containerRef} className="viewport-shell" style={{ width: viewportWidth }} onScroll={handleScroll}>
        <div className="viewport-spacer" style={{ height: totalHeight }}>
          {visibleRows.map(message => {
            const index = messages.findIndex(candidate => candidate.id === message.id);
            return (
              <MessageRow
                key={message.id}
                message={message}
                top={offsets[index]}
                width={viewportWidth}
                density={density}
                onMeasure={handleMeasure}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function App() {
  const navigate = useNavigate();
  const params = useParams();
  const [mode, setMode] = useState('baseline');
  const [stress, setStress] = useState({
    viewportWidth: 700,
    density: 1,
    lineLengthMix: 52,
    sessionScale: 1,
  });
  const [metrics, setMetrics] = useState({
    visibleRows: 0,
    measuredRows: 0,
    measurementCount: 0,
    scrollTop: 0,
    totalHeight: 0,
    averageAbsError: 0,
    maxError: 0,
    anchorCorrectionCount: 0,
    anchorCorrectionPixels: 0,
    runtime: getRuntimeStats(),
    viewportWidth: stress.viewportWidth,
  });

  const sessions = useMemo(
    () =>
      generateSessions({
        lineLengthMix: stress.lineLengthMix,
        sessionScale: stress.sessionScale,
      }),
    [stress.lineLengthMix, stress.sessionScale],
  );

  const selectedSession = sessions.find(session => session.id === params.sessionId) ?? sessions[0];

  useEffect(() => {
    if (!params.sessionId && sessions[0]) {
      navigate(`/${sessions[0].id}`, { replace: true });
      return;
    }

    if (params.sessionId && !sessions.find(session => session.id === params.sessionId) && sessions[0]) {
      navigate(`/${sessions[0].id}`, { replace: true });
    }
  }, [navigate, params.sessionId, sessions]);

  return (
    <main className="app-shell">
      <SessionList sessions={sessions} selectedSessionId={selectedSession.id} />

      <section className="center-column">
        <header className="hero-card">
          <p className="eyebrow">React Router 7 + React + Vite</p>
          <h1>Long chat layout POC</h1>
          <p>
            This is a local evaluation harness for long, variable-height chat threads. The comparison focuses on the hard part:
            predicting row heights early enough to keep scroll math calm during deep sessions and width changes.
          </p>
          <p className="hero-warning">
            The assisted lane in this build uses the actual `@chenglou/pretext` package. Local runtime counters and prepared-handle
            caching are wrapped around it only for instrumentation.
          </p>
        </header>

        <Controls mode={mode} setMode={setMode} stress={stress} setStress={setStress} />

        <ChatViewport
          messages={selectedSession.messages}
          mode={mode}
          viewportWidth={stress.viewportWidth}
          density={stress.density}
          onMetricsChange={setMetrics}
        />
      </section>

      <InstrumentPanel metrics={metrics} session={selectedSession} />
    </main>
  );
}
