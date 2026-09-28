import { captionFontStack, type CaptionStyleDef } from "../../data/caption-styles";

/**
 * A caption drawn with a real caption style.
 *
 * The recipes come straight from `src/data/caption-styles.ts` — the same
 * table the renderer burns into the video — so a style previewed on the
 * website is the style the app produces: same typeface, same case, same
 * tracking, same colours, same hairline outline and soft shadow.
 *
 * (The renderer draws on canvas at 1080p; this is the CSS equivalent at
 * website scale, which is why the outline and shadow are expressed in ems.)
 */
export default function CaptionLine({
  text,
  style,
  size = 15,
  highlightWord,
  className,
}: {
  text: string;
  style: CaptionStyleDef;
  /** Rendered font size in px. */
  size?: number;
  /** Word index painted in the style's highlight colour (karaoke mode). */
  highlightWord?: number;
  className?: string;
}) {
  const words = text.split(" ");
  const outline = Math.max(0.5, (style.borderWidth / 720) * size * 7);
  const shadow = `0 ${(style.shadowOffset / 720) * size * 7}px ${(style.shadowBlur / 720) * size * 7}px rgba(0,0,0,${style.shadowStrength})`;

  return (
    <span
      className={`mkt-caption ${className ?? ""}`}
      style={{
        fontFamily: captionFontStack(style.fontId),
        fontSize: size,
        letterSpacing: `${style.letterSpacing}em`,
        textTransform: style.uppercase ? "uppercase" : "none",
        color: style.textColor,
        background: style.background === "blocked" ? style.bgColor : "transparent",
        WebkitTextStroke: `${outline}px ${style.borderColor}`,
        paintOrder: "stroke fill",
        textShadow: shadow,
      }}
    >
      {words.map((word, index) => (
        <span
          key={`${word}-${index}`}
          className="mkt-caption-word"
          style={{ color: index === highlightWord ? style.highlightColor : undefined }}
        >
          {word}
          {index < words.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}
