import type { Bot } from "@hybrid/core";

export function BotAvatar({
  bot,
  name = "?",
  className = "",
}: {
  bot?: Pick<Bot, "name" | "avatar">;
  name?: string;
  className?: string;
}) {
  const label = bot?.name || name;
  const avatar = bot?.avatar;
  const hue =
    [...label].reduce((sum, letter) => sum + letter.codePointAt(0)!, 0) % 360;
  return (
    <span
      aria-hidden="true"
      className={`avatar ${className}`}
      style={{
        background: avatar?.background || `hsl(${hue} 27% 31%)`,
        color: avatar?.foreground || `hsl(${hue} 45% 88%)`,
        borderRadius: `${avatar?.radius ?? 30}%`,
      }}
    >
      {avatar?.kind === "image" ? (
        <img
          alt=""
          src={avatar.value}
          style={{
            width: "100%",
            height: "100%",
            objectFit: avatar.fit,
            transform: `translate(${avatar.x}%, ${avatar.y}%) scale(${avatar.scale})`,
          }}
        />
      ) : (
        <span>{avatar?.value || [...label].slice(0, 2).join("")}</span>
      )}
    </span>
  );
}
