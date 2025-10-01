const ORBS = [
  { top: "8%", left: "18%", size: "32rem", color: "rgba(214, 160, 52, 0.16)", duration: "38s", delay: "0s" },
  { top: "72%", left: "22%", size: "28rem", color: "rgba(86, 110, 224, 0.14)", duration: "32s", delay: "4s" },
  { top: "42%", left: "78%", size: "30rem", color: "rgba(92, 198, 220, 0.18)", duration: "40s", delay: "2s" }
];

const RAYS = [
  {
    top: "-15%",
    left: "65%",
    width: "48rem",
    height: "48rem",
    rotation: "22deg",
    opacity: 0.24,
    duration: "52s"
  },
  {
    top: "60%",
    left: "85%",
    width: "42rem",
    height: "42rem",
    rotation: "-18deg",
    opacity: 0.18,
    duration: "46s"
  }
];

export function AnimatedBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#040307]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(22,18,33,0.95),_rgba(4,3,8,0.98))]" />

      <div className="absolute inset-0 opacity-60 mix-blend-screen twinkle-layer" />
      <div
        className="absolute inset-0 opacity-35 mix-blend-screen twinkle-layer"
        style={{ animationDuration: "48s", backgroundSize: "180px 180px" }}
      />

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(215,172,72,0.18),rgba(0,0,0,0)_55%),radial-gradient(circle_at_80%_8%,rgba(92,142,255,0.14),rgba(0,0,0,0)_70%)]" />

      {RAYS.map((ray, index) => (
        <div
          key={`ray-${index}`}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{
            top: ray.top,
            left: ray.left,
            width: ray.width,
            height: ray.height,
            transform: `rotate(${ray.rotation})`
          }}
        >
          <div
            className="floating-ray"
            style={{
              opacity: ray.opacity,
              animationDuration: ray.duration
            }}
          />
        </div>
      ))}

      {ORBS.map((orb, index) => (
        <div
          key={`orb-${index}`}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{
            top: orb.top,
            left: orb.left,
            width: orb.size,
            height: orb.size
          }}
        >
          <div
            className="floating-orb"
            style={{
              background: `radial-gradient(circle at 35% 30%, ${orb.color} 0%, rgba(0,0,0,0) 70%)`,
              animationDuration: orb.duration,
              animationDelay: orb.delay
            }}
          />
        </div>
      ))}

      <div className="absolute inset-x-0 bottom-0 h-[45%] bg-[radial-gradient(ellipse_at_bottom,_rgba(118,75,23,0.18),transparent_70%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,_rgba(0,0,0,0)_0%,_rgba(0,0,0,0.58)_80%,_rgba(0,0,0,0.92)_100%)]" />
    </div>
  );
}
