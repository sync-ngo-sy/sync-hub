import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck, Users } from "lucide-react";
import type { AccessRoster } from "@/lib/contracts";
import { platformApi } from "@/lib/platformApi";
import { PageIntro, Panel, Tag } from "@/components/ui";

export function AccessManagementPage() {
  const [roster, setRoster] = useState<AccessRoster | null>(null);

  useEffect(() => {
    let active = true;
    platformApi.getAccessRoster().then((nextRoster) => {
      if (active) {
        setRoster(nextRoster);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  if (!roster) {
    return (
      <div className="page-stack">
        <PageIntro
          eyebrow="Tenant security"
          title="Access management"
          description="Manage recruiter roles, operational access, and audit visibility. The frontend is prepared for strict tenant scoping and role-aware actions."
        />
        <Panel className="table-card">
          <p className="muted">Loading access roster...</p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Tenant security"
        title="Access management"
        description="Manage recruiter roles, operational access, and audit visibility. The frontend is prepared for strict tenant scoping and role-aware actions."
      />

      <div className="admin-grid">
        <Panel className="table-card">
          <div className="skill-list">
            <Users size={16} />
            <h3>Workspace members</h3>
          </div>
          <table style={{ marginTop: 16 }}>
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {roster.users.map((user) => (
                <tr key={user.name}>
                  <td>
                    <strong>{user.name}</strong>
                    <div className="muted">{user.scope}</div>
                  </td>
                  <td>{user.role}</td>
                  <td>
                    <Tag tone={user.status === "Active" ? "success" : "warning"}>{user.status}</Tag>
                  </td>
                  <td>{user.lastSeen}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel className="table-card">
          <div className="stack">
            <div className="skill-list">
              <ShieldCheck size={16} />
              <h3>Role definitions</h3>
            </div>
            {roster.roles.map((role) => (
              <div key={role.name} className="evidence-card">
                <div className="signal-row">
                  <strong>{role.name}</strong>
                  <Tag>{role.permissions.length} permissions</Tag>
                </div>
                <p>{role.summary}</p>
                <div className="skill-list">
                  {role.permissions.map((permission) => (
                    <Tag key={permission} tone="primary">
                      {permission}
                    </Tag>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel className="table-card">
        <div className="stack">
          <div className="skill-list">
            <KeyRound size={16} />
            <h3>Audit trail</h3>
          </div>
          <div className="three-column-grid">
            {roster.auditTrail.map((entry) => (
              <div key={`${entry.actor}-${entry.timestamp}`} className="evidence-card">
                <div className="signal-row">
                  <strong>{entry.actor}</strong>
                  <span>{entry.timestamp}</span>
                </div>
                <p>{entry.action}</p>
                <Tag>{entry.target}</Tag>
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </div>
  );
}
