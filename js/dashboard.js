export async function initDashboard(supabase, session) {

  // ─── Profile load ───
  let currentProfile = null;
  let activeChannel = 'general';
  let replyToMessage = null;

  async function loadProfile() {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
    if (error || !data) return;
    currentProfile = data;

    // Display username + join date
    const username = data.username || session.user.email?.split('@')[0] || 'Unknown';
    const el = document.getElementById('display-username');
    if (el) el.textContent = username;
    const joinel = document.getElementById('display-joined');
    if (joinel) joinel.textContent = 'Member since ' + new Date(session.user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const usernameInput = document.getElementById('profile-username-input');
    if (usernameInput) usernameInput.value = username;
    const bioInput = document.getElementById('profile-bio-input');
    if (bioInput) bioInput.value = data.bio || '';

    updateAvatarBanner(data);
    setupLicense(data);

    if (data.is_admin) {
      const adminBtn = document.getElementById('tab-btn-admin');
      if (adminBtn) { adminBtn.style.display = 'flex'; loadAdminPanel(); }
    }
  }

  function updateAvatarBanner(profile) {
    const bannerArea = document.getElementById('banner-area');
    const avatarImg = document.getElementById('profile-avatar-preview');
    if (bannerArea && profile.banner_url) {
      bannerArea.style.backgroundImage = `url('${profile.banner_url}')`;
    }
    if (avatarImg) {
      avatarImg.src = profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.username||'U')}&background=161616&color=ec4899&size=80`;
    }
  }

  function setupLicense(profile) {
    const container = document.getElementById('license-status-container');
    if (!container) return;
    if (profile.has_access) {
      container.innerHTML = `
        <div class="license-badge active">
          <div class="license-icon"></div>
          <div>
            <div class="license-label">Full Suite — Active</div>
            <div style="font-size:0.8rem;color:var(--text-3);margin-top:0.2rem">All modules unlocked. Lifetime access.</div>
          </div>
        </div>
        <div style="font-size:0.875rem;color:var(--text-2);line-height:1.7">
          <p>You have access to:</p>
          <ul style="margin-top:0.5rem;padding-left:1.25rem;display:flex;flex-direction:column;gap:0.35rem">
            <li>OSINT Framework</li>
            <li>Payload Builder</li>
            <li>Breach Engine</li>
          </ul>
        </div>`;
    } else {
      container.innerHTML = `
        <div class="license-badge inactive">
          <div class="license-icon"></div>
          <div>
            <div class="license-label" style="color:var(--text-2)">No active license</div>
            <div style="font-size:0.8rem;color:var(--text-3);margin-top:0.2rem">Free tier — OSINT Framework only</div>
          </div>
        </div>
        <p style="font-size:0.875rem;color:var(--text-2);margin-bottom:1.5rem;line-height:1.7">Upgrade to unlock the Payload Builder and Breach Engine.</p>
        <a href="/#pricing" class="btn btn-primary" id="btn-purchase-access">View pricing</a>`;
    }
  }

  // ─── Profile form save ───
  const profileForm = document.getElementById('profile-edit-form');
  if (profileForm) {
    profileForm.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = document.getElementById('btn-save-profile');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
      const bio = document.getElementById('profile-bio-input')?.value || '';
      const { error } = await supabase.from('profiles').update({ bio, updated_at: new Date() }).eq('id', session.user.id);
      if (btn) { btn.disabled = false; btn.textContent = 'Save changes'; }
      if (error) { window.showToast?.('Failed to save: ' + error.message, 'error'); }
      else { window.showToast?.('Profile updated', 'success'); }
    });
  }

  // ─── Image uploads ───
  async function handleUpload(file, bucket) {
    if (!file) return null;
    const ext = file.name.split('.').pop();
    const path = `${session.user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
    if (error) { window.showToast?.('Upload failed: ' + error.message, 'error'); return null; }
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  document.getElementById('upload-avatar')?.addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    window.showToast?.('Uploading avatar...', 'info');
    const url = await handleUpload(file, 'avatars');
    if (url) {
      await supabase.from('profiles').update({ avatar_url: url }).eq('id', session.user.id);
      const img = document.getElementById('profile-avatar-preview');
      if (img) img.src = url;
      window.showToast?.('Avatar updated', 'success');
    }
  });

  document.getElementById('upload-banner')?.addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    window.showToast?.('Uploading banner...', 'info');
    const url = await handleUpload(file, 'banners');
    if (url) {
      await supabase.from('profiles').update({ banner_url: url }).eq('id', session.user.id);
      const ba = document.getElementById('banner-area');
      if (ba) ba.style.backgroundImage = `url('${url}')`;
      window.showToast?.('Banner updated', 'success');
    }
  });

  // ─── Admin Panel ───
  async function loadAdminPanel() {
    const tbody = document.getElementById('admin-users-table');
    if (!tbody) return;
    const { data: users, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (error) { tbody.innerHTML = `<tr><td colspan="5" style="color:var(--red)">Failed to load users.</td></tr>`; return; }

    tbody.innerHTML = '';
    users.forEach(u => {
      const tr = document.createElement('tr');
      const timeoutStr = u.timeout_until ? new Date(u.timeout_until).toLocaleString() : '—';
      const accessBadge = u.has_access
        ? `<span class="badge badge-green">Active</span>`
        : `<span class="badge badge-gray">No access</span>`;
      const statusBadge = u.is_banned
        ? `<span class="badge badge-red">Banned</span>`
        : `<span class="badge badge-gray">OK</span>`;

      tr.innerHTML = `
        <td>
          <div style="font-weight:600;font-size:0.875rem">${u.username || '—'}</div>
          <div style="font-size:0.75rem;color:var(--text-3)">${u.id.slice(0,8)}...</div>
        </td>
        <td>${accessBadge}</td>
        <td>${statusBadge}</td>
        <td style="font-size:0.8rem;color:var(--text-2)">${timeoutStr}</td>
        <td>
          <div class="admin-actions">
            <button class="btn btn-sm btn-outline" onclick="window.adminToggleAccess('${u.id}', ${!u.has_access})">${u.has_access ? 'Revoke' : 'Grant'}</button>
            <button class="btn btn-sm btn-danger" onclick="window.adminToggleBan('${u.id}', ${!u.is_banned})">${u.is_banned ? 'Unban' : 'Ban'}</button>
            <button class="btn btn-sm btn-outline" onclick="window.adminTimeout('${u.id}')">24h timeout</button>
          </div>
        </td>`;
      tbody.appendChild(tr);
    });
  }

  window.adminToggleAccess = async (id, val) => {
    await supabase.from('profiles').update({ has_access: val }).eq('id', id);
    window.showToast?.(`Access ${val ? 'granted' : 'revoked'}`, 'success');
    loadAdminPanel();
  };
  window.adminToggleBan = async (id, val) => {
    await supabase.from('profiles').update({ is_banned: val }).eq('id', id);
    window.showToast?.(`User ${val ? 'banned' : 'unbanned'}`, val ? 'error' : 'success');
    loadAdminPanel();
  };
  window.adminTimeout = async (id) => {
    const d = new Date(); d.setHours(d.getHours() + 24);
    await supabase.from('profiles').update({ timeout_until: d.toISOString() }).eq('id', id);
    window.showToast?.('24h timeout applied', 'info');
    loadAdminPanel();
  };

  // ─── Friends ───
  const friendForm = document.getElementById('friend-request-form');
  if (friendForm) {
    friendForm.addEventListener('submit', async e => {
      e.preventDefault();
      const input = document.getElementById('friend-username-input');
      const statusEl = document.getElementById('friend-status-msg');
      const target = input.value.trim();
      if (!target) return;

      const { data: user, error } = await supabase.from('profiles').select('id').eq('username', target).single();
      if (error || !user) { statusEl.textContent = 'User not found.'; return; }
      if (user.id === session.user.id) { statusEl.textContent = 'You cannot add yourself.'; return; }

      const { error: insertErr } = await supabase.from('friends').insert({ requester_id: session.user.id, addressee_id: user.id, status: 'pending' });
      if (insertErr) { statusEl.textContent = 'Request already sent or an error occurred.'; }
      else { statusEl.textContent = 'Request sent!'; input.value = ''; loadFriends(); }
      setTimeout(() => { statusEl.textContent = ''; }, 4000);
    });
  }

  async function loadFriends() {
    const pendingList = document.getElementById('friends-pending-list');
    const activeList  = document.getElementById('friends-active-list');
    if (!pendingList || !activeList) return;
    pendingList.innerHTML = ''; activeList.innerHTML = '';

    const { data, error } = await supabase.from('friends')
      .select('id, status, requester_id, addressee_id, req:requester_id(id,username,avatar_url), add:addressee_id(id,username,avatar_url)')
      .or(`requester_id.eq.${session.user.id},addressee_id.eq.${session.user.id}`);
    if (error) return;

    if (!data.length) {
      pendingList.innerHTML = `<div style="font-size:0.8rem;color:var(--text-3)">No pending requests</div>`;
      activeList.innerHTML  = `<div style="font-size:0.8rem;color:var(--text-3)">No friends yet</div>`;
      return;
    }

    data.forEach(f => {
      const isReq = f.requester_id === session.user.id;
      const other = isReq ? f.add : f.req;
      const avatar = other?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(other?.username||'?')}&background=161616&color=ec4899&size=36`;
      const div = document.createElement('div');
      div.className = 'friend-item';

      let action = '';
      if (f.status === 'pending') {
        action = isReq
          ? `<span style="font-size:0.75rem;color:var(--text-3)">Pending...</span>`
          : `<button class="btn btn-primary btn-sm" onclick="window.acceptFriend('${f.id}')">Accept</button>`;
      }

      div.innerHTML = `
        <div style="display:flex;align-items:center;gap:0.65rem">
          <img src="${avatar}" class="friend-avatar" alt="">
          <span style="font-size:0.875rem;font-weight:500">${other?.username || 'Unknown'}</span>
        </div>
        <div>${action}</div>`;

      if (f.status === 'pending') pendingList.appendChild(div);
      else activeList.appendChild(div);
    });
  }

  window.acceptFriend = async id => {
    await supabase.from('friends').update({ status: 'accepted' }).eq('id', id);
    window.showToast?.('Friend request accepted', 'success');
    loadFriends();
  };

  // ─── Chat ───
  function escapeHtml(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function cancelReply() {
    replyToMessage = null;
    const rp = document.getElementById('chat-reply-preview');
    if (rp) rp.classList.remove('show');
  }

  document.getElementById('btn-cancel-reply')?.addEventListener('click', cancelReply);

  window.setReply = (msgId, author, text) => {
    replyToMessage = msgId;
    const pa = document.getElementById('reply-preview-author');
    const pt = document.getElementById('reply-preview-text');
    if (pa) pa.textContent = author;
    if (pt) pt.textContent = text.substring(0, 60) + (text.length > 60 ? '...' : '');
    const rp = document.getElementById('chat-reply-preview');
    if (rp) rp.classList.add('show');
    document.getElementById('chat-message-input')?.focus();
  };

  window.addReaction = async (msgId, emoji) => {
    await supabase.from('reactions').insert({ message_id: msgId, profile_id: session.user.id, emoji });
  };

  window.openUserModal = async userId => {
    const { data: u } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (!u) return;
    document.getElementById('user-modal-username').textContent = u.username || 'Unknown';
    document.getElementById('user-modal-bio').textContent = u.bio || 'No bio provided.';
    const av = document.getElementById('user-modal-avatar');
    if (av) av.src = u.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.username||'?')}&background=161616&color=ec4899&size=80`;
    const banner = document.getElementById('user-modal-banner');
    if (banner) banner.style.backgroundImage = u.banner_url ? `url('${u.banner_url}')` : 'none';
    document.getElementById('user-modal').classList.add('open');
    document.getElementById('user-modal-overlay').classList.add('open');

    const addBtn = document.getElementById('btn-modal-add-friend');
    if (addBtn) {
      addBtn.disabled = false; addBtn.textContent = 'Add Friend';
      addBtn.onclick = async () => {
        const { error } = await supabase.from('friends').insert({ requester_id: session.user.id, addressee_id: u.id, status: 'pending' });
        if (error) window.showToast?.('Could not send request', 'error');
        else { addBtn.textContent = 'Request Sent'; addBtn.disabled = true; window.showToast?.('Friend request sent', 'success'); }
      };
    }
  };

  function renderMessage(msg) {
    const messages = document.getElementById('chat-messages');
    if (!messages) return;
    const div = document.createElement('div');
    div.className = 'chat-message-row';
    const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const username = msg.profiles?.username || 'Anonymous';
    const isAdmin = msg.profiles?.is_admin;
    const avatarUrl = msg.profiles?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=161616&color=ec4899&size=40`;
    const content = escapeHtml(msg.content);

    let replyHtml = '';
    if (msg.reply_to_id && msg.reply_to_msg) {
      replyHtml = `<div style="font-size:0.75rem;color:var(--text-3);padding:0.25rem 0.5rem;border-left:2px solid var(--pink);margin-bottom:0.35rem;line-height:1.4">↳ ${msg.reply_to_msg.profiles?.username || 'Unknown'}</div>`;
    }

    let reactionsHtml = '';
    if (msg.reactions?.length) {
      const counts = {};
      msg.reactions.forEach(r => counts[r.emoji] = (counts[r.emoji] || 0) + 1);
      reactionsHtml = '<div style="display:flex;gap:0.25rem;margin-top:0.3rem;flex-wrap:wrap">';
      for (const [e, c] of Object.entries(counts)) {
        reactionsHtml += `<span class="reaction-badge" onclick="window.addReaction('${msg.id}','${e}')">${e} ${c}</span>`;
      }
      reactionsHtml += '</div>';
    }

    div.innerHTML = `
      <img src="${avatarUrl}" class="chat-avatar-clickable" onclick="window.openUserModal('${msg.profile_id}')" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0;margin-top:2px" alt="">
      <div style="flex:1;min-width:0">
        ${replyHtml}
        <div style="display:flex;align-items:baseline;gap:0.5rem;margin-bottom:0.2rem">
          <strong style="font-size:0.875rem;cursor:pointer;font-weight:600" onclick="window.openUserModal('${msg.profile_id}')">${escapeHtml(username)}</strong>
          ${isAdmin ? `<span style="font-family:var(--mono);font-size:0.65rem;color:var(--pink);letter-spacing:0.06em;text-transform:uppercase">admin</span>` : ''}
          <span style="font-size:0.7rem;color:var(--text-3)">${time}</span>
        </div>
        <div style="font-size:0.875rem;color:var(--text-2);line-height:1.5;word-break:break-word">${content}</div>
        ${reactionsHtml}
      </div>
      <div class="chat-actions">
        <button class="chat-action-btn" title="Reply" onclick="window.setReply('${msg.id}','${escapeHtml(username)}','${content.replace(/'/g,"\\'")}')">↩</button>
        <button class="chat-action-btn" title="👍" onclick="window.addReaction('${msg.id}','👍')">👍</button>
        <button class="chat-action-btn" title="💀" onclick="window.addReaction('${msg.id}','💀')">💀</button>
      </div>`;

    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  async function loadMessages() {
    const messages = document.getElementById('chat-messages');
    if (!messages) return;
    messages.innerHTML = '';
    const { data, error } = await supabase
      .from('messages')
      .select('*, profiles(username, is_admin, avatar_url), reply_to_msg:reply_to_id(profiles(username)), reactions(emoji, profile_id)')
      .eq('channel_id', activeChannel)
      .order('created_at', { ascending: true })
      .limit(50);
    if (error) { console.error(error); return; }
    if (!data.length) {
      messages.innerHTML = `<div style="color:var(--text-3);text-align:center;font-family:var(--mono);font-size:0.8rem;margin-top:2rem">No messages yet in #${activeChannel}.</div>`;
    } else { data.forEach(renderMessage); }
  }

  // Channel switching
  document.querySelectorAll('.channel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.channel-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeChannel = btn.dataset.channel;
      const titleEl = document.getElementById('chat-channel-title');
      if (titleEl) titleEl.textContent = '# ' + activeChannel;
      const inputEl = document.getElementById('chat-message-input');
      if (inputEl) inputEl.placeholder = `Message #${activeChannel}...`;
      cancelReply();
      loadMessages();
    });
  });

  // Chat send
  const chatForm = document.getElementById('chat-input-form');
  if (chatForm) {
    chatForm.addEventListener('submit', async e => {
      e.preventDefault();
      const input = document.getElementById('chat-message-input');
      const content = input?.value.trim();
      if (!content) return;
      input.value = '';

      if (currentProfile?.is_banned) { window.showToast?.('You are banned from chatting.', 'error'); return; }
      if (currentProfile?.timeout_until && new Date(currentProfile.timeout_until) > new Date()) {
        window.showToast?.(`You're timed out until ${new Date(currentProfile.timeout_until).toLocaleString()}`, 'error'); return;
      }

      const replyId = replyToMessage;
      cancelReply();
      await supabase.from('messages').insert({ profile_id: session.user.id, channel_id: activeChannel, reply_to_id: replyId, content });
    });
  }

  // Realtime
  supabase.channel('public:messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async payload => {
      if (payload.new.channel_id !== activeChannel) return;
      const { data: msg } = await supabase.from('messages')
        .select('*, profiles(username, is_admin, avatar_url), reply_to_msg:reply_to_id(profiles(username)), reactions(emoji, profile_id)')
        .eq('id', payload.new.id).single();
      const messages = document.getElementById('chat-messages');
      if (messages?.innerHTML.includes('No messages yet')) messages.innerHTML = '';
      if (msg) renderMessage(msg);
    }).subscribe();

  supabase.channel('public:reactions')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reactions' }, () => loadMessages())
    .subscribe();

  // Init
  await loadProfile();
  loadFriends();
  loadMessages();
}
