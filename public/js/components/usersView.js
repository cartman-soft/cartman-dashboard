/**
 * Users & Permissions View Component
 * User administration, role assignment (Admin, Accounts, Staff), and RBAC permissions matrix.
 */

const UsersView = {
  async render(container) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-muted);">
        <div>Loading users and security permissions...</div>
      </div>
    `;

    try {
      const [usersRes, rolesRes] = await Promise.all([
        API.users.getAll().catch(() => ({ data: [] })),
        API.users.getRoles()
      ]);

      const users = usersRes.data || [];
      const roles = rolesRes.matrix || [];

      container.innerHTML = `
        ${window.isDemoMode ? `
          <div style="background: #fffbeb; border: 1.5px solid #fde68a; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px; display: flex; align-items: center; gap: 12px; color: #92400e;">
            <span style="font-size: 24px;">🔒</span>
            <div>
              <div style="font-weight: 700; font-size: 13.5px;">Disabled in Public Demo</div>
              <div style="font-size: 12px; margin-top: 2px;">User management, role assignment, and password modifications are locked in the public demo.</div>
            </div>
          </div>
        ` : ''}

        <div class="section-header">
          <div>
            <div class="section-title">Users & Role-Based Access Control (RBAC)</div>
            <div style="font-size: 12px; color: var(--text-muted);">Configure user privileges, 2-Factor OTP requirements, and permissions</div>
          </div>
          <button class="btn-primary" id="btnOpenCreateUserModal" ${window.isDemoMode ? 'style="opacity: 0.6; cursor: not-allowed;"' : ''}>
            ${window.isDemoMode ? '🔒 Add User (Demo Locked)' : '➕ Add New User Account'}
          </button>
        </div>

        <!-- 1. Users List Table -->
        <div class="data-table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>User & Email</th>
                <th>Assigned Role</th>
                <th>2FA / OTP Status</th>
                <th>Account Status</th>
                <th>Created At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${users.map(u => `
                <tr>
                  <td>
                    <div style="font-weight: 700; color: #fff;">${u.fullName}</div>
                    <div style="font-size: 11px; color: var(--text-dim); margin-top: 2px;">${u.email}</div>
                  </td>
                  <td>
                    <span class="role-pill ${u.role.toLowerCase()}">${u.role}</span>
                  </td>
                  <td>
                    <span style="color: #34d399; font-size: 12px; font-weight: 600;">🛡️ Active (6-Digit OTP)</span>
                  </td>
                  <td>
                    <span class="badge-status ${u.status === 'active' ? 'connected' : 'cancelled'}">${u.status}</span>
                  </td>
                  <td style="font-size: 11px; color: var(--text-dim);">
                    ${new Date(u.createdAt).toLocaleDateString('en-IN')}
                  </td>
                  <td>
                    <button class="btn-secondary btn-edit-user" data-id="${u.id}" data-name="${u.fullName}" data-role="${u.role}" style="padding: 3px 8px; font-size: 11px;">
                      Edit Role
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- 2. Role Permissions Matrix Section -->
        <div class="section-header" style="margin-top: 28px;">
          <div class="section-title">RBAC Permissions Matrix</div>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
          ${roles.map(r => `
            <div class="metric-card" style="padding: 20px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                <span class="role-pill ${r.role.toLowerCase()}" style="font-size: 11.5px; padding: 4px 10px;">${r.role}</span>
                <span style="font-size: 11px; color: var(--text-dim);">Backend Enforced</span>
              </div>
              <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">${r.description}</div>
              <ul style="list-style: none; font-size: 12px; display: flex; flex-direction: column; gap: 6px;">
                ${r.permissions.map(p => `
                  <li style="display: flex; align-items: center; gap: 6px; color: #cbd5e1;">
                    <span style="color: #10b981;">✓</span>
                    <span>${p}</span>
                  </li>
                `).join('')}
              </ul>
            </div>
          `).join('')}
        </div>
      `;

      this.bindEvents(container);
    } catch (err) {
      container.innerHTML = `<div class="callout-box warning">Failed to load users: ${err.message}</div>`;
    }
  },

  bindEvents(container) {
    const addBtn = container.querySelector('#btnOpenCreateUserModal');
    if (addBtn) {
      addBtn.onclick = () => {
        if (window.isDemoMode) {
          API.toast('Disabled in Public Demo: File uploads, imports, account edits, user management, and data-changing actions are locked in demo mode.', 'error');
          return;
        }
        this.showCreateUserModal();
      };
    }

    container.querySelectorAll('.btn-edit-user').forEach(btn => {
      btn.onclick = () => {
        if (window.isDemoMode) {
          API.toast('Disabled in Public Demo: File uploads, imports, account edits, user management, and data-changing actions are locked in demo mode.', 'error');
          return;
        }
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name');
        const role = btn.getAttribute('data-role');
        this.showEditUserModal(id, name, role);
      };
    });
  },

  showCreateUserModal() {
    const modal = document.getElementById('appModal');
    const card = document.getElementById('modalCard');

    card.innerHTML = `
      <div class="modal-header">
        <div class="modal-title">Create New User Account</div>
        <button class="btn-close-modal" id="btnCloseModal">✕</button>
      </div>
      <div class="modal-body">
        <form id="createUserForm">
          <div class="form-group">
            <label class="form-label">Full Name *</label>
            <input type="text" class="form-control" id="newFullName" placeholder="e.g. Suman Sen" required>
          </div>
          <div class="form-group">
            <label class="form-label">Email Address *</label>
            <input type="email" class="form-control" id="newEmail" placeholder="e.g. suman@cartman.com" required>
          </div>
          <div class="form-group">
            <label class="form-label">Role Assignment *</label>
            <select class="form-control" id="newRole" required>
              <option value="Staff">Staff (Operations & Order Monitoring)</option>
              <option value="Accounts">Accounts (Financial Statements & Bank Recon)</option>
              <option value="Admin">Admin (Full System & Integration Control)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Temporary Password *</label>
            <input type="password" class="form-control" id="newPassword" placeholder="Minimum 8 characters" required>
          </div>
          <div class="callout-box" style="margin-bottom: 0;">
            <span style="font-size: 14px;">🛡️</span>
            <div style="font-size: 11px;">Password is hashed with bcrypt salt 10. The user will be required to authenticate with a 6-digit OTP code upon logging in.</div>
          </div>
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="btnCancelModal">Cancel</button>
        <button class="btn-primary" id="btnSubmitCreateUser">Create User</button>
      </div>
    `;

    modal.classList.add('active');
    const closeModal = () => modal.classList.remove('active');
    card.querySelector('#btnCloseModal').onclick = closeModal;
    card.querySelector('#btnCancelModal').onclick = closeModal;

    card.querySelector('#btnSubmitCreateUser').onclick = async () => {
      const form = card.querySelector('#createUserForm');
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      const fullName = card.querySelector('#newFullName').value;
      const email = card.querySelector('#newEmail').value;
      const role = card.querySelector('#newRole').value;
      const password = card.querySelector('#newPassword').value;

      try {
        const res = await API.users.create({ fullName, email, role, password });
        API.toast(res.message, 'success');
        closeModal();
        UsersView.render(document.getElementById('viewContainer'));
      } catch (err) {
        API.toast(err.message, 'error');
      }
    };
  },

  showEditUserModal(id, name, currentRole) {
    const modal = document.getElementById('appModal');
    const card = document.getElementById('modalCard');

    card.innerHTML = `
      <div class="modal-header">
        <div class="modal-title">Edit User Role: ${name}</div>
        <button class="btn-close-modal" id="btnCloseModal">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Assigned Role</label>
          <select class="form-control" id="editRoleSelect">
            <option value="Staff" ${currentRole === 'Staff' ? 'selected' : ''}>Staff</option>
            <option value="Accounts" ${currentRole === 'Accounts' ? 'selected' : ''}>Accounts</option>
            <option value="Admin" ${currentRole === 'Admin' ? 'selected' : ''}>Admin</option>
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="btnCancelModal">Cancel</button>
        <button class="btn-primary" id="btnSubmitEditRole">Save Changes</button>
      </div>
    `;

    modal.classList.add('active');
    const closeModal = () => modal.classList.remove('active');
    card.querySelector('#btnCloseModal').onclick = closeModal;
    card.querySelector('#btnCancelModal').onclick = closeModal;

    card.querySelector('#btnSubmitEditRole').onclick = async () => {
      const role = card.querySelector('#editRoleSelect').value;
      try {
        await API.users.update(id, { role });
        API.toast('Role updated successfully.', 'success');
        closeModal();
        UsersView.render(document.getElementById('viewContainer'));
      } catch (e) {
        API.toast(e.message, 'error');
      }
    };
  }
};
