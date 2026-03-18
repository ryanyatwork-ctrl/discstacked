import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Camera, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "@/hooks/use-toast";

export default function Profile() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile, isLoading, updateProfile, uploadAvatar } = useProfile();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentName = displayName ?? profile?.display_name ?? "";
  const initials = currentName
    ? currentName.slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? "?";

  const handleSave = async () => {
    if (displayName === null) return;
    try {
      await updateProfile.mutateAsync({ display_name: displayName });
      toast({ title: "Profile updated" });
    } catch {
      toast({ title: "Error", description: "Failed to update profile", variant: "destructive" });
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 2MB", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const url = await uploadAvatar(file);
      await updateProfile.mutateAsync({ avatar_url: url });
      toast({ title: "Avatar updated" });
    } catch {
      toast({ title: "Error", description: "Failed to upload avatar", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  if (!user) {
    navigate("/auth");
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold text-foreground">Profile</h1>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 py-8 space-y-8">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <Avatar className="h-24 w-24">
              {profile?.avatar_url ? (
                <AvatarImage src={profile.avatar_url} alt="Avatar" />
              ) : null}
              <AvatarFallback className="text-2xl bg-secondary text-muted-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-0 right-0 p-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Camera className="h-4 w-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
            />
          </div>
          {uploading && <p className="text-xs text-muted-foreground">Uploading...</p>}
        </div>

        {/* Display Name */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Display Name</label>
          <Input
            placeholder="Enter a display name"
            value={currentName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>

        {/* Email (read-only) */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Email</label>
          <Input value={user.email ?? ""} disabled className="opacity-60" />
          <p className="text-xs text-muted-foreground">Your email is private and never shared.</p>
        </div>

        <Button
          onClick={handleSave}
          disabled={displayName === null || updateProfile.isPending}
          className="w-full gap-2"
        >
          <Save className="h-4 w-4" />
          {updateProfile.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
