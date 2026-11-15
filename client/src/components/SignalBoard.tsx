// The product in one moving picture for the public pages: an order as a signal on a circuit
// board — the agent sends it, the rules rack checks it rule by rule (LEDs light green), the
// approval module holds it (amber, blinking) until a person clears it, and Valio Aimo
// orders it. Static data, CSS-only animation on one 8s loop; reduced motion shows the end state.
import { Box } from '@chakra-ui/react';

const v = (token: string) => `var(--chakra-colors-${token})`;
const MONO = 'var(--chakra-fonts-mono)';
const DOT = 'var(--chakra-fonts-dot)';

const rules = ['≤ €1,200 an order', 'Dairy only', 'Lactose-free only', 'Over limit → Mikko'];

// Timeline (percent of the loop): the pulse leaves the agent, is inside the rack 14–44,
// travels to approval 44–52, is held 52–70, travels to Valio 70–80, ordered from 80.
const css = `
.sb-pulse { animation: sb-move 8s linear infinite; }
@keyframes sb-move {
  0% { transform: translateX(0); opacity: 1; }
  12% { transform: translateX(46px); opacity: 1; }
  14%, 44% { transform: translateX(46px); opacity: 0; }
  45% { transform: translateX(196px); opacity: 1; }
  52% { transform: translateX(236px); opacity: 1; }
  54%, 70% { transform: translateX(236px); opacity: 0; }
  71% { transform: translateX(336px); opacity: 1; }
  80% { transform: translateX(370px); opacity: 1; }
  82%, 100% { transform: translateX(370px); opacity: 0; }
}
.sb-trace { stroke-dasharray: 1; stroke-dashoffset: 1; animation: 8s linear infinite; }
.sb-t1 { animation-name: sb-t1; }
.sb-t2 { animation-name: sb-t2; }
.sb-t3 { animation-name: sb-t3; }
@keyframes sb-t1 { 0% { stroke-dashoffset: 1; } 12%, 92% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: 1; } }
@keyframes sb-t2 { 0%, 44% { stroke-dashoffset: 1; } 52%, 92% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: 1; } }
@keyframes sb-t3 { 0%, 70% { stroke-dashoffset: 1; } 80%, 92% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: 1; } }
.sb-led { animation: 8s steps(1) infinite; }
.sb-r0 { animation-name: sb-r0; } .sb-r1 { animation-name: sb-r1; } .sb-r2 { animation-name: sb-r2; } .sb-r3 { animation-name: sb-r3; }
@keyframes sb-r0 { 0%, 18% { fill: ${v('led-idle')}; } 18.01%, 96% { fill: ${v('led-auto')}; } }
@keyframes sb-r1 { 0%, 25% { fill: ${v('led-idle')}; } 25.01%, 96% { fill: ${v('led-auto')}; } }
@keyframes sb-r2 { 0%, 32% { fill: ${v('led-idle')}; } 32.01%, 96% { fill: ${v('led-auto')}; } }
@keyframes sb-r3 { 0%, 39% { fill: ${v('led-idle')}; } 39.01%, 96% { fill: ${v('led-pending')}; } }
.sb-ap { animation-name: sb-ap; }
@keyframes sb-ap {
  0%, 52% { fill: ${v('led-idle')}; }
  53%, 56%, 59%, 62%, 65% { fill: ${v('led-pending')}; }
  54.5%, 57.5%, 60.5%, 63.5% { fill: ${v('led-idle')}; }
  68%, 96% { fill: ${v('led-auto')}; }
}
.sb-va { animation-name: sb-va; }
@keyframes sb-va { 0%, 80% { fill: ${v('led-idle')}; } 80.01%, 96% { fill: ${v('led-auto')}; } }
.sb-word { animation: sb-word 8s steps(1) infinite; }
@keyframes sb-word { 0%, 80% { opacity: 0.18; } 80.01%, 96% { opacity: 1; } }
.sb-hold { animation: sb-hold 8s steps(1) infinite; }
@keyframes sb-hold { 0%, 52% { opacity: 0; } 52.01%, 68% { opacity: 1; } 68.01%, 100% { opacity: 0; } }
.sb-ok { animation: sb-ok 8s steps(1) infinite; }
@keyframes sb-ok { 0%, 68% { opacity: 0; } 68.01%, 96% { opacity: 1; } 96.01%, 100% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .sb-pulse { display: none; }
  .sb-trace { stroke-dashoffset: 0; animation: none; }
  .sb-led, .sb-word, .sb-hold, .sb-ok { animation: none; }
  .sb-r0, .sb-r1, .sb-r2, .sb-va, .sb-ap { fill: ${v('led-auto')}; }
  .sb-r3 { fill: ${v('led-pending')}; }
  .sb-hold { opacity: 0; }
}
`;

/** One hardware module: hairline box, caption, title, an LED top-right, port rings on its sides. */
const Module = ({
  x,
  y,
  w,
  h,
  n,
  caption,
  title,
  led,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  n: string;
  caption: string;
  title?: string;
  led?: string;
}) => (
  <g>
    <rect x={x} y={y} width={w} height={h} rx={6} fill={v('bg-panel')} stroke={v('border-strong')} strokeWidth={1} />
    <text x={x + 10} y={y + 17} style={{ fontFamily: MONO, fontSize: '8.5px' }} letterSpacing="0.1em" fill={v('fg-subtle')}>
      <tspan fill={v('fg')}>{n}</tspan> {caption}
    </text>
    {title ? (
      <text x={x + 10} y={y + 38} style={{ fontSize: '13px', fontWeight: 600 }} fill={v('fg')} letterSpacing="-0.01em">
        {title}
      </text>
    ) : null}
    {led ? <circle className={`sb-led ${led}`} cx={x + w - 12} cy={y + 14} r={3.5} fill={v('led-idle')} /> : null}
    <circle cx={x} cy={y + h / 2} r={3.5} fill={v('bg-panel')} stroke={v('border-strong')} />
    <circle cx={x + w} cy={y + h / 2} r={3.5} fill={v('bg-panel')} stroke={v('border-strong')} />
  </g>
);

export const SignalBoard = () => {
  const mid = 140;
  return (
    <Box asChild width="100%" height="auto" display="block">
      <svg viewBox="4 22 556 236" role="img" aria-label="An order travels from the agent through the rules and an approval to Valio Aimo">
        <style>{css}</style>
        {/* Traces: idle copper underneath, the energised orange drawn over it as the signal passes. */}
        {[
          [110, 156, 't1'],
          [306, 346, 't2'],
          [446, 480, 't3'],
        ].map(([a, b, t]) => (
          <g key={t}>
            <path d={`M${a} ${mid}H${b}`} stroke={v('edge-idle')} strokeWidth={1.5} />
            <path className={`sb-trace sb-${t}`} d={`M${a} ${mid}H${b}`} pathLength={1} stroke={v('edge-live')} strokeWidth={2} />
          </g>
        ))}

        <Module x={14} y={110} w={96} h={60} n="01" caption="AGENT" title="Kitchen bot" />

        {/* The rules rack: one row per rule, each with its LED. */}
        <Module x={156} y={30} w={150} h={220} n="02" caption="RULES · SIGNED" />
        {rules.map((r, i) => (
          <g key={r}>
            <line x1={166} x2={296} y1={58 + i * 46} y2={58 + i * 46} stroke={v('border')} />
            <circle className={`sb-led sb-r${i}`} cx={174} cy={81 + i * 46} r={3.5} fill={v('led-idle')} />
            <text x={186} y={78 + i * 46} style={{ fontFamily: MONO, fontSize: '8.5px' }} fill={v('fg-subtle')} letterSpacing="0.06em">
              R0{i + 1}
            </text>
            <text x={186} y={92 + i * 46} style={{ fontSize: '11px' }} fill={v('fg')}>
              {r}
            </text>
          </g>
        ))}

        <Module x={346} y={110} w={100} h={60} n="03" caption="APPROVAL" title="Mikko L." led="sb-ap" />
        <text className="sb-hold" x={356} y={162} style={{ fontFamily: MONO, fontSize: '8.5px' }} fill={v('status-pending')} letterSpacing="0.08em">
          HOLD
        </text>
        <text className="sb-ok" x={356} y={162} style={{ fontFamily: MONO, fontSize: '8.5px' }} fill={v('status-auto')} letterSpacing="0.08em">
          APPROVED
        </text>

        <Module x={480} y={96} w={74} h={88} n="04" caption="VALIO" led="sb-va" />
        <text className="sb-word" x={517} y={158} textAnchor="middle" style={{ fontFamily: DOT, fontSize: '17px', fontWeight: 800 }} fill={v('status-auto')}>
          OK
        </text>

        {/* The signal. */}
        <g className="sb-pulse">
          <circle cx={110} cy={mid} r={7} fill={v('brand-accent')} opacity={0.18} />
          <circle cx={110} cy={mid} r={3.5} fill={v('brand-accent')} />
        </g>
      </svg>
    </Box>
  );
};
