import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { usePublicProfile, usePublicCollection } from "@/hooks/useProfile";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PosterCard } from "@/components/PosterCard";
import { MediaItem, MediaTab } from "@/lib/types";
import logo from "@/assets/DiscStacked_16x9.png";

export default function SharedCollection() {
  const { token } = useParams<{ token: string }>();
  const { data: profile, isLoading: profileLoading } = usePublicProfile(token);
  const { data: items, isLoading: itemsLoading } = usePublicCollection(profile?.user_id);

  const mediaItems = useMemo(() => {
    if (!items) return [];
    return items.map((db: any): MediaItem => ({
      id: db.id,
      title: db.title,
      year: db.year ?? undefined,
      format: db.format ?? undefined,
      formats: db.formats?.length > 0 ? db.formats : db.format ? [db.format] : undefined,
      posterUrl: db.poster_url ?? undefined,
      genre: db.genre ?? undefined,
      rating: db.rating ?? undefined,
      mediaType: db.media_type as MediaTab,
      inPlex: db.in_plex,
      digitalCopy: db.digital_copy,
      wishlist: db.wishlist,
      wantToWatch: db.want_to_watch,
    }));
  }, [items]);

  const grouped = useMemo(() => {
    const groups: Record<string, MediaItem[]> = {};
    mediaItems.forEach((item) => {
      const first = item.title[0]?.toUpperCase();
      const key = first && /[A-Z]/.test(first) ? first : "#";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return groups;
  }, [mediaItems]);

  if (profileLoading || itemsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading collection...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Collection not found</p>
      </div>
    );
  }

  const name = profile.display_name || "Someone";
  const initials = name.slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-3 max-w-5xl mx-auto">
          <img src={logo} alt="DiscStacked" className="h-8 w-auto rounded object-contain" />
          <div className="flex items-center gap-2 ml-auto">
            <Avatar className="h-8 w-8">
              {profile.avatar_url && <AvatarImage src={profile.avatar_url} />}
              <AvatarFallback className="text-xs bg-secondary text-muted-foreground">{initials}</AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium text-foreground">{name}'s Collection</span>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-4">
        <p className="text-xs text-muted-foreground mb-4">{mediaItems.length} items</p>
        {Object.keys(grouped).sort().map((letter) => (
          <div key={letter} className="mb-6">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">{letter}</h2>
            <div className="poster-grid">
              {grouped[letter].map((item) => (
                <PosterCard key={item.id} item={item} onClick={() => {}} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
