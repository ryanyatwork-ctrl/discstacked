import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAdmin } from "@/hooks/useAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Shield, Trash2, Users, Loader2, AlertTriangle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { AppFooter } from "@/components/AppFooter";

// No hardcoded password — verified server-side via ADMIN_SETUP_PASSWORD secret

interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  display_name: string | null;
  avatar_url: string | null;
  item_count: number;
  roles: string[];
}

export default function Admin() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading, setupAdmin, listUsers, deleteUser, checkAdminExists } = useAdmin();

  const [setupMode, setSetupMode] = useState(false);
  const [setupPassword, setSetupPassword] = useState("");
  const [setupError, setSetupError] = useState("");
  const [settingUp, setSettingUp] = useState(false);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!adminLoading && user && !isAdmin) {
      checkAdminExists().then((exists) => {
        if (exists === false) {
          setSetupMode(true);
        }
      });
    }
  }, [adminLoading, user, isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const data = await listUsers();
      setUsers(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load users");
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleSetup = async () => {
    if (!setupPassword) return;
    setSettingUp(true);
    setSetupError("");
    try {
      await setupAdmin(setupPassword);
      toast.success("Admin role activated!");
      setSetupMode(false);
    } catch (err: any) {
      setSetupError(err.message || "Setup failed");
    } finally {
      setSettingUp(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || confirmEmail !== deleteTarget.email) return;
    setDeleting(true);
    try {
      await deleteUser(deleteTarget.id);
      toast.success(`Deleted user ${deleteTarget.email} and all their data`);
      setDeleteTarget(null);
      setConfirmEmail("");
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  if (authLoading || adminLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Setup mode — first-time admin password
  if (setupMode && !isAdmin) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
          <div className="flex items-center gap-3 px-4 py-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Shield className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold text-foreground">Admin Setup</h1>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="w-full max-w-sm space-y-4">
            <div className="text-center space-y-2">
              <Shield className="h-12 w-12 mx-auto text-primary" />
              <h2 className="text-xl font-bold text-foreground">Admin Setup</h2>
              <p className="text-sm text-muted-foreground">
                No admin account exists yet. Enter the setup password to activate admin for your account.
              </p>
            </div>
            <Input
              type="password"
              placeholder="Enter admin setup password"
              value={setupPassword}
              onChange={(e) => setSetupPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSetup()}
            />
            {setupError && (
              <p className="text-sm text-destructive">{setupError}</p>
            )}
            <Button className="w-full" onClick={handleSetup} disabled={settingUp || !setupPassword}>
              {settingUp ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Activate Admin
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // Not admin and admin already exists
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-2">
          <AlertTriangle className="h-12 w-12 mx-auto text-destructive" />
          <h2 className="text-xl font-bold text-foreground">Access Denied</h2>
          <p className="text-sm text-muted-foreground">You do not have admin privileges.</p>
          <Button variant="outline" onClick={() => navigate("/")}>Go Home</Button>
        </div>
      </div>
    );
  }

  // Admin dashboard
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Shield className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">Admin Dashboard</h1>
          <Badge variant="secondary" className="ml-auto">
            <Users className="h-3 w-3 mr-1" />
            {users.length} users
          </Badge>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6 space-y-6">

        <div className="flex items-center justify-between">
          <h2 className="text-foreground font-semibold">Registered Users</h2>
          <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loadingUsers}>
            {loadingUsers ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
          </Button>
        </div>

        {loadingUsers && users.length === 0 ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-2">
            {users.map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card"
              >
                <Avatar className="h-10 w-10">
                  <AvatarImage src={u.avatar_url || undefined} />
                  <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                    {(u.display_name || u.email || "?").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">
                      {u.display_name || u.email}
                    </span>
                    {u.roles.includes("admin") && (
                      <Badge variant="default" className="text-[10px] px-1.5 py-0">Admin</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{u.email}</span>
                    <span>•</span>
                    <span>{u.item_count} items</span>
                    <span>•</span>
                    <span>Joined {new Date(u.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                {!u.roles.includes("admin") && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleteTarget(u)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      <AppFooter />

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setConfirmEmail(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Delete User Account
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <span className="block">
                This will permanently delete <strong>{deleteTarget?.email}</strong> and all their data including:
              </span>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li>All media items ({deleteTarget?.item_count} items)</li>
                <li>Profile data and avatar</li>
                <li>Cover art files</li>
                <li>Authentication account</li>
              </ul>
              <span className="block font-medium text-foreground">
                Type the user's email to confirm:
              </span>
              <Input
                placeholder={deleteTarget?.email}
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={confirmEmail !== deleteTarget?.email || deleting}
              onClick={handleDelete}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
