export async function initDashboard(supabase, session) {

  let currentProfile = null;
  let activeChannel = 'general';
  let replyToMessage = null;

  // ─── Profile ───
  async function loadProfile() {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
    if (error || !data) return;
    currentProfile = data;

    const username = data.username || session.user.email?.split('@')[0] || 'User';

    const elName = document.getElementById('display-username');
    if (elName) elName.textContent = username;

    const elJoined = document.getElementById('display-joined');
    if (elJoined) elJoined.textContent = 'Member since ' + new Date(session.user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const elInput = document.getElementById('profile-username-input');
    if (elInput) elInput.value = username;

    const elBio = document.getElementById('profile-bio-input');
    if (elBio) elBio.value = data.bio || '';

    // Avatar & Banner
    const avatarImg = document.getElementById('profile-avatar-img');
    if (avatarImg) {
      avatarImg.src = data.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=161616&color=ec4899&size=80&bold=true`;
    }
    const bannerArea = document.getElementById('banner-area');
    if (bannerArea && data.banner_url) {
      bannerArea.style.backgroundImage = `url('${data.banner_url}')`;
      bannerArea.style.backgroundSize = 'cover';
      bannerArea.style.backgroundPosition = 'center';
    }

    // Subscriber badge
    const badgeArea = document.getElementById('profile-badge-area');
    if (badgeArea) {
      if (data.has_access) {
        badgeArea.innerHTML = `
          <div class="sub-badge">
            <span class="sub-badge-dot"></span>
            Subscriber
          </div>`;
      } else {
        badgeArea.innerHTML = '';
      }
    }

    // License panel
    setupLicense(data);

    // Admin tab
    if (data.is_admin) {
      const adminBtn = document.getElementById('tab-btn-admin');
      if (adminBtn) { adminBtn.style.display = 'flex'; loadAdminPanel(); }
    }
  }

  function setupLicense(profile) {
    const el = document.getElementById('license-status-container');
    if (!el) return;

    if (profile.has_access) {
      el.innerHTML = `
        <div class="license-card active" style="margin-bottom:1.5rem">
          <div class="license-status-row">
            <span class="license-dot"></span>
            <span class="license-title">Full Suite — Active</span>
          </div>
          <div class="license-desc">All modules unlocked. Lifetime access. All future updates included.</div>
        </div>
        <div style="font-size:0.875rem;color:var(--text-2);line-height:1.75">
          <p style="margin-bottom:0.65rem;font-weight:600;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-3)">Active modules</p>
          <div style="display:flex;flex-direction:column;gap:0.5rem">
            <div style="padding:0.75rem 1rem;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);font-size:0.875rem">OSINT Framework</div>
            <div style="padding:0.75rem 1rem;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);font-size:0.875rem">Payload Builder</div>
            <div style="padding:0.75rem 1rem;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);font-size:0.875rem">Breach Engine</div>
          </div>
        </div>`;
    } else {
      el.innerHTML = `
        <div class="license-card inactive" style="margin-bottom:1.5rem">
          <div class="license-status-row">
            <span class="license-dot"></span>
            <span class="license-title" style="color:var(--text-2)">No active license</span>
          </div>
          <div class="license-desc">Free tier — OSINT Framework guest access only</div>
        </div>
        <p style="font-size:0.875rem;color:var(--text-2);line-height:1.7;margin-bottom:1.25rem">Upgrade to unlock the Payload Builder and Breach Engine.</p>
        <a href="/#pricing" class="btn btn-primary" onclick="window.showLanding();window.scrollTo({top:document.getElementById('pricing')?.offsetTop||0,behavior:'smooth'})">View pricing</a>`;
    }
  }

  // ─── Profile form save ───
  document.getElementById('profile-edit-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('btn-save-profile');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
    const bio = document.getElementById('profile-bio-input')?.value || '';
    const { error } = await supabase.from('profiles').update({ bio, updated_at: new Date().toISOString() }).eq('id', session.user.id);
    if (btn) { btn.disabled = false; btn.textContent = 'Save changes'; }
    window.showToast?.(error ? 'Failed to save: ' + error.message : 'Profile updated', error ? 'error' : 'success');
  });

  // ─── Image uploads ───
  async function uploadFile(file, bucket) {
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
    const url = await uploadFile(file, 'avatars');
    if (url) {
      await supabase.from('profiles').update({ avatar_url: url }).eq('id', session.user.id);
      const img = document.getElementById('profile-avatar-img');
      if (img) img.src = url;
      window.showToast?.('Avatar updated', 'success');
    }
  });

  document.getElementById('upload-banner')?.addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    window.showToast?.('Uploading banner...', 'info');
    const url = await uploadFile(file, 'banners');
    if (url) {
      await supabase.from('profiles').update({ banner_url: url }).eq('id', session.user.id);
      const ba = document.getElementById('banner-area');
      if (ba) { ba.style.backgroundImage = `url('${url}')`; ba.style.backgroundSize = 'cover'; ba.style.backgroundPosition = 'center'; }
      window.showToast?.('Banner updated', 'success');
    }
  });

  // ─── Admin Panel ───
  async function loadAdminPanel() {
    const tbody = document.getElementById('admin-users-table');
    if (!tbody) return;
    const { data: users, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (error) { tbody.innerHTML = `<tr><td colspan="5" style="color:var(--red)">Failed to load.</td></tr>`; return; }
    tbody.innerHTML = '';
    users.forEach(u => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div style="font-weight:600;font-size:0.875rem">${u.username || '—'}</div>
          <div style="font-size:0.72rem;color:var(--text-3)">${u.id.slice(0,8)}…</div>
        </td>
        <td>${u.has_access ? `<span class="badge badge-green">Active</span>` : `<span class="badge badge-gray">None</span>`}</td>
        <td>${u.is_banned ? `<span class="badge badge-red">Banned</span>` : `<span class="badge badge-gray">OK</span>`}</td>
        <td style="font-size:0.78rem;color:var(--text-2)">${u.timeout_until ? new Date(u.timeout_until).toLocaleString() : '—'}</td>
        <td>
          <div class="admin-actions">
            <button class="btn btn-sm btn-outline" onclick="window.adminAccess('${u.id}',${!u.has_access})">${u.has_access ? 'Revoke' : 'Grant'}</button>
            <button class="btn btn-sm btn-danger" onclick="window.adminBan('${u.id}',${!u.is_banned})">${u.is_banned ? 'Unban' : 'Ban'}</button>
            <button class="btn btn-sm btn-outline" onclick="window.adminTimeout('${u.id}')">24h Timeout</button>
          </div>
        </td>`;
      tbody.appendChild(tr);
    });
  }

  window.adminAccess = async (id, val) => {
    await supabase.from('profiles').update({ has_access: val }).eq('id', id);
    window.showToast?.(`Access ${val ? 'granted' : 'revoked'}`, val ? 'success' : 'info');
    loadAdminPanel();
  };
  window.adminBan = async (id, val) => {
    await supabase.from('profiles').update({ is_banned: val }).eq('id', id);
    window.showToast?.(`User ${val ? 'banned' : 'unbanned'}`, val ? 'error' : 'success');
    loadAdminPanel();
  };
  window.adminTimeout = async id => {
    const d = new Date(); d.setHours(d.getHours() + 24);
    await supabase.from('profiles').update({ timeout_until: d.toISOString() }).eq('id', id);
    window.showToast?.('24h timeout applied', 'info');
    loadAdminPanel();
  };

  // ─── Friends ───
  document.getElementById('friend-request-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const input = document.getElementById('friend-username-input');
    const statusEl = document.getElementById('friend-status-msg');
    const target = input?.value.trim();
    if (!target) return;

    const { data: user, error } = await supabase.from('profiles').select('id').eq('username', target).single();
    if (error || !user) { if (statusEl) statusEl.textContent = 'User not found.'; return; }
    if (user.id === session.user.id) { if (statusEl) statusEl.textContent = 'You cannot add yourself.'; return; }

    const { error: ie } = await supabase.from('friends').insert({ requester_id: session.user.id, addressee_id: user.id, status: 'pending' });
    if (statusEl) statusEl.textContent = ie ? 'Request already sent.' : 'Request sent!';
    if (!ie) { if (input) input.value = ''; loadFriends(); }
    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 4000);
  });

  async function loadFriends() {
    const pl = document.getElementById('friends-pending-list');
    const al = document.getElementById('friends-active-list');
    if (!pl || !al) return;
    pl.innerHTML = ''; al.innerHTML = '';

    const { data, error } = await supabase.from('friends')
      .select('id,status,requester_id,addressee_id,req:requester_id(id,username,avatar_url),add:addressee_id(id,username,avatar_url)')
      .or(`requester_id.eq.${session.user.id},addressee_id.eq.${session.user.id}`);
    if (error) return;

    if (!data.length) {
      pl.innerHTML = `<div style="font-size:0.8rem;color:var(--text-3)">No pending requests</div>`;
      al.innerHTML = `<div style="font-size:0.8rem;color:var(--text-3)">No friends yet</div>`;
      return;
    }

    data.forEach(f => {
      const isReq = f.requester_id === session.user.id;
      const other = isReq ? f.add : f.req;
      const av = other?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(other?.username||'?')}&background=161616&color=ec4899&size=36`;
      const div = document.createElement('div');
      div.className = 'friend-item';
      const action = f.status === 'pending'
        ? (isReq ? `<span style="font-size:0.72rem;color:var(--text-3)">Pending…</span>` : `<button class="btn btn-primary btn-sm" onclick="window.acceptFriend('${f.id}')">Accept</button>`)
        : '';
      div.innerHTML = `
        <div style="display:flex;align-items:center;gap:0.6rem">
          <img src="${av}" class="friend-av" alt="">
          <span style="font-size:0.875rem;font-weight:500">${other?.username || 'Unknown'}</span>
        </div>
        <div>${action}</div>`;
      (f.status === 'pending' ? pl : al).appendChild(div);
    });
  }

  window.acceptFriend = async id => {
    await supabase.from('friends').update({ status: 'accepted' }).eq('id', id);
    window.showToast?.('Friend accepted', 'success');
    loadFriends();
  };

  // ─── Chat ───
  function escHtml(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function cancelReply() {
    replyToMessage = null;
    document.getElementById('chat-reply-preview')?.classList.remove('show');
  }

  document.getElementById('btn-cancel-reply')?.addEventListener('click', cancelReply);

  window.setReply = (msgId, author, text) => {
    replyToMessage = msgId;
    const pa = document.getElementById('reply-preview-author');
    const pt = document.getElementById('reply-preview-text');
    if (pa) pa.textContent = author;
    if (pt) pt.textContent = text.slice(0, 60) + (text.length > 60 ? '…' : '');
    document.getElementById('chat-reply-preview')?.classList.add('show');
    document.getElementById('chat-message-input')?.focus();
  };

  window.addReaction = async (msgId, emoji) => {
    await supabase.from('reactions').insert({ message_id: msgId, profile_id: session.user.id, emoji });
  };

  window.openUserModal = async userId => {
    const { data: u } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (!u) return;
    document.getElementById('um-username').textContent = u.username || 'Unknown';
    document.getElementById('um-bio').textContent = u.bio || 'No bio provided.';
    const av = document.getElementById('um-avatar');
    if (av) av.src = u.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.username||'?')}&background=161616&color=ec4899&size=80`;
    const banner = document.getElementById('um-banner');
    if (banner) banner.style.backgroundImage = u.banner_url ? `url('${u.banner_url}')` : 'none';
    document.getElementById('user-modal')?.classList.add('open');
    document.getElementById('user-modal-bg')?.classList.add('open');

    const addBtn = document.getElementById('btn-modal-add-friend');
    if (addBtn) {
      addBtn.disabled = false; addBtn.textContent = 'Add Friend';
      addBtn.onclick = async () => {
        const { error } = await supabase.from('friends').insert({ requester_id: session.user.id, addressee_id: u.id, status: 'pending' });
        if (!error) { addBtn.textContent = 'Request Sent'; addBtn.disabled = true; window.showToast?.('Friend request sent', 'success'); }
        else window.showToast?.('Could not send request', 'error');
      };
    }
  };

  function renderMessage(msg) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    // Remove empty state message
    const empty = container.querySelector('[data-empty]');
    if (empty) empty.remove();

    const div = document.createElement('div');
    div.className = 'chat-message-row';
    const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const username = msg.profiles?.username || 'Anonymous';
    const isAdmin = msg.profiles?.is_admin;
    const av = msg.profiles?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=161616&color=ec4899&size=36`;
    const content = escHtml(msg.content);

    const replyHtml = (msg.reply_to_id && msg.reply_to_msg)
      ? `<div style="font-size:0.72rem;color:var(--text-3);padding:0.2rem 0.5rem;border-left:2px solid var(--pink);margin-bottom:0.3rem">↳ ${msg.reply_to_msg.profiles?.username || '?'}</div>` : '';

    let reactHtml = '';
    if (msg.reactions?.length) {
      const counts = {};
      msg.reactions.forEach(r => counts[r.emoji] = (counts[r.emoji] || 0) + 1);
      reactHtml = '<div style="display:flex;gap:0.25rem;margin-top:0.3rem;flex-wrap:wrap">';
      for (const [e, c] of Object.entries(counts)) reactHtml += `<span class="reaction-badge" onclick="window.addReaction('${msg.id}','${e}')">${e} ${c}</span>`;
      reactHtml += '</div>';
    }

    div.innerHTML = `
      <img src="${av}" class="chat-avatar-click" onclick="window.openUserModal('${msg.profile_id}')" style="width:34px;height:34px;border-radius:50%;object-fit:cover;flex-shrink:0;margin-top:2px" alt="">
      <div style="flex:1;min-width:0">
        ${replyHtml}
        <div style="display:flex;align-items:baseline;gap:0.5rem;margin-bottom:0.2rem">
          <strong style="font-size:0.875rem;font-weight:600;cursor:pointer" onclick="window.openUserModal('${msg.profile_id}')">${escHtml(username)}</strong>
          ${isAdmin ? `<span style="font-family:var(--mono);font-size:0.6rem;color:var(--pink);letter-spacing:0.08em;text-transform:uppercase">admin</span>` : ''}
          <span style="font-size:0.68rem;color:var(--text-3)">${time}</span>
        </div>
        <div style="font-size:0.875rem;color:var(--text-2);line-height:1.55;word-break:break-word">${content}</div>
        ${reactHtml}
      </div>
      <div class="chat-actions">
        <button class="chat-action-btn" title="Reply" onclick="window.setReply('${msg.id}','${escHtml(username)}','${content.replace(/'/g,"\\'")}')">↩</button>
        <button class="chat-action-btn" onclick="window.addReaction('${msg.id}','👍')">👍</button>
        <button class="chat-action-btn" onclick="window.addReaction('${msg.id}','💀')">💀</button>
      </div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  async function loadMessages() {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    container.innerHTML = '';
    const { data, error } = await supabase.from('messages')
      .select('*, profiles(username,is_admin,avatar_url), reply_to_msg:reply_to_id(profiles(username)), reactions(emoji,profile_id)')
      .eq('channel_id', activeChannel).order('created_at', { ascending: true }).limit(50);
    if (error) { console.error(error); return; }
    if (!data.length) {
      container.innerHTML = `<div data-empty style="color:var(--text-3);text-align:center;font-family:var(--mono);font-size:0.78rem;margin-top:2rem">No messages yet in #${activeChannel}.</div>`;
    } else { data.forEach(renderMessage); }
  }

  // Channel switching
  document.querySelectorAll('.channel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.channel-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeChannel = btn.dataset.channel;
      const title = document.getElementById('chat-channel-title');
      if (title) title.textContent = '# ' + activeChannel;
      const inp = document.getElementById('chat-message-input');
      if (inp) inp.placeholder = `Message #${activeChannel}…`;
      cancelReply();
      loadMessages();
    });
  });

  // Send message
  document.getElementById('chat-input-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const inp = document.getElementById('chat-message-input');
    const content = inp?.value.trim(); if (!content) return;
    if (inp) inp.value = '';

    if (currentProfile?.is_banned) { window.showToast?.('You are banned from chatting.', 'error'); return; }
    if (currentProfile?.timeout_until && new Date(currentProfile.timeout_until) > new Date()) {
      window.showToast?.(`Timed out until ${new Date(currentProfile.timeout_until).toLocaleString()}`, 'error'); return;
    }

    const replyId = replyToMessage; cancelReply();
    await supabase.from('messages').insert({ profile_id: session.user.id, channel_id: activeChannel, reply_to_id: replyId, content });
  });

  // Realtime
  supabase.channel('public:messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async payload => {
      if (payload.new.channel_id !== activeChannel) return;
      const { data: msg } = await supabase.from('messages')
        .select('*, profiles(username,is_admin,avatar_url), reply_to_msg:reply_to_id(profiles(username)), reactions(emoji,profile_id)')
        .eq('id', payload.new.id).single();
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
