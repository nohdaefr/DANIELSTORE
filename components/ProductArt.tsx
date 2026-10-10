import type { ArtSpec } from "@/lib/product-art";

// Flat packaging illustrations, drawn on a 120×120 grid with the object
// standing on y≈104. Decorative only: the product name is always shown as text.

const INK = "#1d2a22";

function Shadow({ rx = 30 }: { rx?: number }) {
  return <ellipse cx="60" cy="105" rx={rx} ry="4.5" fill={INK} opacity="0.12" />;
}

function Label({ x = 60, y, text, size = 9, color = "#fff" }: { x?: number; y: number; text?: string; size?: number; color?: string }) {
  if (!text) return null;
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      direction="rtl"
      fontFamily="var(--font-body)"
      fontWeight="800"
      fontSize={size}
      fill={color}
    >
      {text}
    </text>
  );
}

function Carton({ label, color = "#2f6db5" }: ArtSpec) {
  return (
    <>
      <Shadow rx={32} />
      {/* side + top */}
      <path d="M76 46 L90 39 L90 97 L76 104 Z" fill="#dfe6ec" />
      <path d="M56 27 L70 20 L90 39 L76 46 Z" fill="#cdd7e0" />
      <path d="M53 25 L68 18 L71 21 L56 28 Z" fill="#b9c5cf" />
      {/* front */}
      <path d="M34 46 L76 46 L76 104 L34 104 Z" fill="#fbfcfd" />
      <path d="M34 46 L55 27 L76 46 Z" fill="#eef2f5" />
      <rect x="34" y="62" width="42" height="26" fill={color} />
      <path d="M76 62 L90 55 L90 81 L76 88 Z" fill={color} opacity="0.75" />
      <Label x={55} y={79} text={label} size={label && label.length > 5 ? 8 : 9.5} />
      <circle cx="64" cy="37" r="3.2" fill={color} />
    </>
  );
}

function Tub({ label, color = "#5aa0d8" }: ArtSpec) {
  return (
    <g transform="translate(60 105) scale(1.18) translate(-60 -105)">
      <Shadow rx={28} />
      <path d="M33 58 L87 58 L81 101 Q60 106 39 101 Z" fill="#fbfcfd" />
      <path d="M78 58 L87 58 L81 101 Q78 102 75 102.5 Z" fill="#e3e9ee" />
      <path d="M35.5 72 L84.5 72 L82.4 88 L37.6 88 Z" fill={color} />
      <Label y={83.5} text={label} size={label && label.length > 5 ? 8.5 : 9.5} />
      <ellipse cx="60" cy="58" rx="29" ry="8" fill={color} />
      <ellipse cx="60" cy="56" rx="29" ry="8" fill={color} />
      <ellipse cx="60" cy="55" rx="23" ry="5.5" fill="#fff" opacity="0.28" />
    </g>
  );
}

function Slices() {
  const slice = (dx: number, dy: number, rot: number) => (
    <g transform={`translate(${dx} ${dy}) rotate(${rot} 60 72)`}>
      <rect x="34" y="46" width="52" height="52" rx="5" fill="#f6c443" />
      <rect x="34" y="46" width="52" height="52" rx="5" fill="none" stroke="#dca321" strokeWidth="1.5" />
      <circle cx="48" cy="60" r="4" fill="#e7ad2b" />
      <circle cx="70" cy="56" r="2.6" fill="#e7ad2b" />
      <circle cx="73" cy="80" r="5" fill="#e7ad2b" />
      <circle cx="51" cy="85" r="2.8" fill="#e7ad2b" />
    </g>
  );
  return (
    <>
      <Shadow rx={30} />
      {slice(-4, 4, -8)}
      {slice(2, 0, 4)}
      {slice(0, -4, -2)}
    </>
  );
}

function Eggs() {
  const egg = (cx: number, cy: number, r = 1) => (
    <g key={`${cx}-${cy}`}>
      <ellipse cx={cx} cy={cy} rx={8.2 * r} ry={10.5 * r} fill="#f4e3c8" />
      <ellipse cx={cx - 2.6 * r} cy={cy - 3.5 * r} rx={2.2 * r} ry={3.2 * r} fill="#fff" opacity="0.7" />
    </g>
  );
  return (
    <>
      <Shadow rx={38} />
      {[30, 50, 70, 90].map((x) => egg(x, 62, 0.92))}
      <path d="M18 70 L102 70 L96 101 L24 101 Z" fill="#c9b08a" />
      {[30, 50, 70, 90].map((x) => egg(x, 72))}
      <path d="M18 78 Q30 86 40 78 Q50 86 60 78 Q70 86 80 78 Q90 86 102 78 L96 101 L24 101 Z" fill="#b99c74" />
      <path d="M24 101 L96 101 L97 96 L23 96 Z" fill="#a88b63" />
    </>
  );
}

function Loaf({ label, color = "#c2412d" }: ArtSpec) {
  return (
    <>
      <Shadow rx={32} />
      <path d="M30 102 L30 60 Q30 38 60 38 Q90 38 90 60 L90 102 Z" fill="#dc9c55" />
      <path d="M35 102 L35 62 Q35 44 60 44 Q85 44 85 62 L85 102 Z" fill="#f4d7a6" />
      {[46, 60, 74].map((x) => (
        <line key={x} x1={x} y1="50" x2={x} y2="100" stroke="#e6bf83" strokeWidth="1.2" />
      ))}
      {/* bag */}
      <path d="M27 104 L27 58 Q27 33 60 33 Q93 33 93 58 L93 104 Z" fill="#fff" opacity="0.32" />
      <rect x="27" y="76" width="66" height="18" fill={color} />
      <Label y={89} text={label} size={10} />
      <path d="M52 33 Q60 26 68 33" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </>
  );
}

function Challah() {
  const knots = [
    [30, 76, -28],
    [44, 66, 24],
    [58, 76, -28],
    [72, 66, 24],
    [86, 76, -28],
  ];
  return (
    <>
      <Shadow rx={42} />
      <ellipse cx="58" cy="84" rx="44" ry="15" fill="#b86a24" />
      {knots.map(([x, y, r]) => (
        <g key={x} transform={`rotate(${r} ${x} ${y})`}>
          <ellipse cx={x} cy={y} rx="14" ry="11" fill="#cf8132" />
          <ellipse cx={x - 3} cy={y - 4} rx="8" ry="4.5" fill="#e8a75a" />
        </g>
      ))}
      {[
        [38, 62],
        [52, 71],
        [66, 61],
        [80, 70],
        [47, 80],
        [74, 82],
      ].map(([x, y]) => (
        <ellipse key={`${x}${y}`} cx={x} cy={y} rx="1.4" ry="0.8" fill="#fbecc8" />
      ))}
    </>
  );
}

function Pita() {
  return (
    <>
      <Shadow rx={38} />
      {[94, 87, 80, 73].map((y) => (
        <g key={y}>
          <ellipse cx="60" cy={y} rx="36" ry="10" fill="#d6a565" />
          <ellipse cx="60" cy={y - 1.6} rx="35" ry="9" fill="#efcf96" />
        </g>
      ))}
      <ellipse cx="48" cy="70" rx="5" ry="1.8" fill="#d9a660" />
      <ellipse cx="70" cy="73" rx="4" ry="1.4" fill="#d9a660" />
      <ellipse cx="62" cy="67" rx="2.6" ry="1" fill="#d9a660" />
    </>
  );
}

function Tomatoes() {
  const tomato = (cx: number, cy: number, r: number) => (
    <g key={cx}>
      <circle cx={cx} cy={cy} r={r} fill="#e1402e" />
      <path d={`M${cx - r * 0.9} ${cy} A ${r} ${r} 0 0 0 ${cx + r * 0.6} ${cy + r * 0.8}`} fill="none" stroke="#c42e20" strokeWidth="2" opacity="0.6" />
      <ellipse cx={cx - r * 0.38} cy={cy - r * 0.4} rx={r * 0.22} ry={r * 0.14} fill="#fff" opacity="0.55" />
      <path
        d={`M${cx} ${cy - r + 1} l-6 -2 l4 4 l-6 2 l7 0 l1 5 l1 -5 l7 0 l-6 -2 l4 -4 z`}
        fill="#3f8a3c"
      />
    </g>
  );
  return (
    <>
      <Shadow rx={36} />
      <path d="M38 42 Q60 26 84 44" fill="none" stroke="#3f8a3c" strokeWidth="3" strokeLinecap="round" />
      {tomato(42, 80, 20)}
      {tomato(80, 80, 19)}
      {tomato(61, 60, 18)}
    </>
  );
}

function Cucumbers() {
  const cuke = (y: number, rot: number) => (
    <g transform={`rotate(${rot} 60 ${y})`}>
      <rect x="18" y={y - 11} width="84" height="22" rx="11" fill="#3e8239" />
      <rect x="24" y={y - 7} width="70" height="5" rx="2.5" fill="#6aa857" opacity="0.6" />
      {[30, 44, 58, 72, 86].map((x) => (
        <circle key={x} cx={x} cy={y + 4} r="1.2" fill="#2c6128" />
      ))}
      <circle cx="101" cy={y} r="3" fill="#6b8f2f" />
    </g>
  );
  return (
    <>
      <Shadow rx={40} />
      {cuke(82, -14)}
      {cuke(66, -24)}
    </>
  );
}

function Onion() {
  return (
    <>
      <Shadow rx={26} />
      <path d="M60 28 Q64 42 78 52 Q94 66 84 88 Q76 102 60 102 Q44 102 36 88 Q26 66 42 52 Q56 42 60 28 Z" fill="#d9963c" />
      <path d="M60 32 Q58 50 50 60 Q40 76 48 98" fill="none" stroke="#b97728" strokeWidth="1.6" />
      <path d="M60 32 Q64 52 72 62 Q80 78 72 98" fill="none" stroke="#b97728" strokeWidth="1.6" />
      <path d="M44 58 Q40 70 44 84" fill="none" stroke="#f0bb6c" strokeWidth="3" strokeLinecap="round" />
      <path d="M56 102 l-3 4 M60 102 l0 5 M64 102 l3 4" stroke="#8d6a3c" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M60 28 q-2 -8 3 -12" fill="none" stroke="#9c6b2a" strokeWidth="2" strokeLinecap="round" />
    </>
  );
}

function Potatoes() {
  const eyes = (pts: number[][]) => pts.map(([x, y]) => <ellipse key={`${x}${y}`} cx={x} cy={y} rx="1.6" ry="1" fill="#9a6c38" />);
  return (
    <>
      <Shadow rx={38} />
      <path d="M22 86 Q20 66 40 62 Q58 58 64 74 Q70 94 50 100 Q26 104 22 86 Z" fill="#c99556" />
      <path d="M56 72 Q60 52 82 52 Q102 54 100 76 Q98 98 76 99 Q58 98 56 72 Z" fill="#d6a565" />
      <ellipse cx="78" cy="62" rx="10" ry="4" fill="#e9c389" opacity="0.7" />
      {eyes([
        [34, 76],
        [46, 90],
        [72, 70],
        [88, 84],
        [80, 92],
      ])}
    </>
  );
}

function Apple() {
  return (
    <>
      <Shadow rx={30} />
      <path d="M60 44 C48 34 26 38 26 64 C26 90 46 106 60 99 C74 106 94 90 94 64 C94 38 72 34 60 44 Z" fill="#e2566b" />
      <path d="M60 44 C72 34 94 38 94 64 C94 82 84 96 72 100 C84 88 88 70 80 56 C74 46 66 44 60 44 Z" fill="#c63e55" opacity="0.6" />
      <ellipse cx="42" cy="58" rx="6" ry="9" fill="#fff" opacity="0.35" transform="rotate(-20 42 58)" />
      <path d="M60 46 Q58 34 63 26" fill="none" stroke="#6b4a2b" strokeWidth="3" strokeLinecap="round" />
      <path d="M63 32 Q74 22 86 28 Q76 38 63 32 Z" fill="#4f9a3e" />
    </>
  );
}

function Bananas() {
  const banana = (dx: number, dy: number, rot: number, fill: string) => (
    <g transform={`translate(${dx} ${dy}) rotate(${rot} 60 70)`}>
      <path d="M30 44 Q34 92 96 88 Q100 86 98 81 Q52 80 40 42 Q35 38 30 44 Z" fill={fill} />
      <path d="M38 50 Q48 76 90 82" fill="none" stroke="#e3b52a" strokeWidth="2" opacity="0.8" />
      <path d="M96 88 l4 -1 l-1 -6" fill="#5b4a22" />
    </g>
  );
  return (
    <>
      <Shadow rx={36} />
      {banana(4, 6, 10, "#f2c936")}
      {banana(-2, 0, 0, "#f6d548")}
      {banana(-6, -6, -10, "#f8de5c")}
      <path d="M26 40 l8 -6 l4 6 z" fill="#6b5524" />
    </>
  );
}

function Pouch({ label, color = "#1f5f3f" }: ArtSpec) {
  return (
    <>
      <Shadow rx={30} />
      <path d="M36 36 L84 36 L89 100 Q60 105 31 100 Z" fill={color} />
      <path d="M78 36 L84 36 L89 100 Q86 101 82 101.5 Z" fill="#000" opacity="0.12" />
      <path d="M36 36 L84 36 L84 30 L80 33 L76 30 L72 33 L68 30 L64 33 L60 30 L56 33 L52 30 L48 33 L44 30 L40 33 L36 30 Z" fill={color} />
      <rect x="34" y="34" width="52" height="4" fill="#000" opacity="0.12" />
      <path d="M38 58 L82 58 L84.5 86 L35.5 86 Z" fill="#fff" />
      <Label y={76} text={label} size={label && label.length > 4 ? 9 : 10.5} color={color} />
      <ellipse cx="46" cy="48" rx="4" ry="7" fill="#fff" opacity="0.18" />
    </>
  );
}

function Jar({ label, color = "#9b6b33" }: ArtSpec) {
  return (
    <>
      <Shadow rx={28} />
      <rect x="38" y="44" width="44" height="60" rx="9" fill={color} />
      <rect x="74" y="48" width="6" height="52" rx="3" fill="#000" opacity="0.12" />
      <rect x="41" y="31" width="38" height="15" rx="3" fill="#2d3b33" />
      <rect x="41" y="40" width="38" height="3" fill="#000" opacity="0.2" />
      <rect x="38" y="62" width="44" height="24" fill="#fbf4e6" />
      <Label y={78} text={label} size={9.5} color={color} />
      <rect x="43" y="50" width="5" height="10" rx="2.5" fill="#fff" opacity="0.25" />
    </>
  );
}

function Oil({ label }: ArtSpec) {
  return (
    <>
      <Shadow rx={20} />
      <rect x="54" y="14" width="12" height="9" rx="2" fill="#1d3b26" />
      <rect x="55.5" y="22" width="9" height="14" fill="#2f5a2c" />
      <path d="M55.5 36 Q44 42 44 56 L44 100 Q60 105 76 100 L76 56 Q76 42 64.5 36 Z" fill="#3c6a2a" />
      <path d="M44 66 L76 66 L76 100 Q60 105 44 100 Z" fill="#b39a2d" opacity="0.55" />
      <rect x="44" y="60" width="32" height="26" fill="#f7efd8" />
      <Label y={72} text={label?.split(" ")[0]} size={8.5} color="#2f5a2c" />
      <Label y={81} text={label?.split(" ")[1]} size={8.5} color="#2f5a2c" />
      <rect x="48" y="40" width="4" height="16" rx="2" fill="#fff" opacity="0.25" />
    </>
  );
}

function PlasticBottle({ label, body, cap, band }: { label?: string; body: string; cap: string; band: string }) {
  return (
    <>
      <Shadow rx={20} />
      <rect x="53" y="14" width="14" height="10" rx="2" fill={cap} />
      <rect x="52" y="23" width="16" height="3" rx="1" fill={cap} opacity="0.8" />
      <path
        d="M54 26 Q42 34 42 48 L42 62 Q46 66 42 70 L42 98 Q42 104 50 104 L70 104 Q78 104 78 98 L78 70 Q74 66 78 62 L78 48 Q78 34 66 26 Z"
        fill={body}
      />
      <rect x="42" y="72" width="36" height="20" fill={band} />
      <Label y={86} text={label} size={9.5} />
      <rect x="46" y="38" width="4" height="22" rx="2" fill="#fff" opacity="0.6" />
    </>
  );
}

const DRAW: Record<ArtSpec["kind"], (spec: ArtSpec) => React.ReactNode> = {
  carton: Carton,
  tub: Tub,
  slices: Slices,
  eggs: Eggs,
  loaf: Loaf,
  challah: Challah,
  pita: Pita,
  tomatoes: Tomatoes,
  cucumbers: Cucumbers,
  onion: Onion,
  potatoes: Potatoes,
  apple: Apple,
  bananas: Bananas,
  pouch: Pouch,
  jar: Jar,
  oil: Oil,
  water: ({ label }) => <PlasticBottle label={label} body="#d3ebf8" cap="#2f7fc1" band="#2f7fc1" />,
  soda: ({ label }) => <PlasticBottle label={label} body="#d6efe0" cap="#1f7a46" band="#1f7a46" />,
};

export default function ProductArt({ spec, className }: { spec: ArtSpec; className?: string }) {
  const Draw = DRAW[spec.kind];
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true" focusable="false">
      <Draw {...spec} />
    </svg>
  );
}
