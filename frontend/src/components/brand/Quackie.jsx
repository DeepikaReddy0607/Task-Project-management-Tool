import clsx from "clsx";
import curiousImage from "../../assets/brand/quackie-curious.png";
import eyesClosedImage from "../../assets/brand/quackie-eyesclosed.png";
import excitedImage from "../../assets/brand/quackie-excited.png";
import happyImage from "../../assets/brand/quackie-happy.png";
import sleepyImage from "../../assets/brand/quackie-sleepy.png";
import surprisedImage from "../../assets/brand/quackie-surprised.png";
import thinkingImage from "../../assets/brand/quackie-thinking.png";
import worriedImage from "../../assets/brand/quackie-worried.png";

const sizeClasses = {
  sm: "h-20 w-20",
  md: "h-32 w-32",
  lg: "h-48 w-48",
};

const emotionAssets = {
  happy: happyImage,
  eyesclosed: eyesClosedImage,
  excited: excitedImage,
  curious: curiousImage,
  thinking: thinkingImage,
  worried: worriedImage,
  sleepy: sleepyImage,
  surprised: surprisedImage,
};

function Quackie({
  alt = "Quackie, TaskFlow's project buddy",
  className,
  decorative = false,
  emotion = "happy",
  size = "md",
  ...props
}) {
  const source = emotionAssets[emotion] || emotionAssets.happy;

  return (
    <figure
      className={clsx("m-0 inline-flex shrink-0", sizeClasses[size] || sizeClasses.md, className)}
      {...props}
    >
      <img
        src={source}
        alt={decorative ? "" : alt}
        aria-hidden={decorative || undefined}
        className="h-full w-full object-contain"
      />
    </figure>
  );
}

export default Quackie;
