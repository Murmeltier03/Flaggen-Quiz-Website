import Image from "next/image";
import { getAvatar } from "@/data/avatars";

type PlayerAvatarProps = {
  avatarId?: string | null;
  size?: number;
  className?: string;
  priority?: boolean;
};

export function PlayerAvatar({ avatarId, size = 40, className = "", priority = false }: PlayerAvatarProps) {
  const avatar = getAvatar(avatarId);
  return (
    <span className={`animal-avatar ${className}`.trim()} style={{ width: size, height: size }} title={avatar.name}>
      <Image src={avatar.src} alt={`${avatar.name}-Avatar`} width={size} height={size} sizes={`${size}px`} priority={priority} />
    </span>
  );
}
