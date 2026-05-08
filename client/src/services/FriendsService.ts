import type {
  FriendAddedEvent,
  FriendEntry,
  FriendErrorEvent,
  FriendPresenceEvent,
  FriendRemovedByUserEvent,
  FriendRequestEntry,
  FriendRequestReceivedEvent,
  FriendRequestRejectedByUserEvent,
  FriendRequestsList,
  SearchUsersResult,
} from '@/events/socket.events';
import { socketService } from '@/services/SocketService';
import { log } from '@/utils/Logger';

type FriendsState = {
  friends: FriendEntry[];
  pending: FriendRequestEntry[];
  sent: FriendRequestEntry[];
};

type Listener = (state: FriendsState) => void;
type NotifListener = (msg: string, kind: 'request' | 'added' | 'removed' | 'rejected') => void;

/**
 * FriendsService — singleton reativo pra friend list, requests e push events.
 *
 * O backend não broadcasta presence (online/offline) automaticamente — só atualiza
 * o `isOnline` quando frontend chama `request_friends`. Por isso refetchamos
 * a lista após eventos relevantes (added/removed/accepted) e periodicamente.
 *
 * Push events do servidor:
 *  - friend_request_received → adiciona em `pending`, dispara notif
 *  - friend_added → refetch tudo + dispara notif
 *  - friend_request_rejected_by_user → remove de `sent`, notif silenciosa
 *  - friend_removed_by_user → refetch tudo + dispara notif
 *  - result_friends (resposta a request_friends) → atualiza lista
 *  - friend_requests_list (resposta a request_friend_requests) → atualiza requests
 */
class FriendsService {
  private state: FriendsState = { friends: [], pending: [], sent: [] };
  private listeners = new Set<Listener>();
  private notifListeners = new Set<NotifListener>();
  private wired = false;

  // ============== PUBLIC API ==============
  get(): Readonly<FriendsState> {
    return this.state;
  }

  /** Inicializa listeners de push events e faz fetch inicial. Chamar após auth. */
  async init(): Promise<void> {
    this.wirePushEvents();
    await Promise.all([this.refreshFriends(), this.refreshRequests()]);
  }

  async refreshFriends(): Promise<void> {
    if (!socketService.isConnected()) return;
    return new Promise((resolve) => {
      const sock = socketService.getSocket();
      const onResult = (data: FriendEntry[]) => {
        sock.off('result_friends', onResult);
        this.state = { ...this.state, friends: Array.isArray(data) ? data : [] };
        this.notify();
        resolve();
      };
      sock.once('result_friends', onResult);
      sock.emit('request_friends');
      // Timeout silencioso pra não travar caller
      setTimeout(() => {
        sock.off('result_friends', onResult);
        resolve();
      }, 5000);
    });
  }

  async refreshRequests(): Promise<void> {
    if (!socketService.isConnected()) return;
    return new Promise((resolve) => {
      const sock = socketService.getSocket();
      const onResult = (data: FriendRequestsList) => {
        sock.off('friend_requests_list', onResult);
        this.state = {
          ...this.state,
          pending: data?.pending ?? [],
          sent: data?.sent ?? [],
        };
        this.notify();
        resolve();
      };
      sock.once('friend_requests_list', onResult);
      sock.emit('request_friend_requests');
      setTimeout(() => {
        sock.off('friend_requests_list', onResult);
        resolve();
      }, 5000);
    });
  }

  sendRequest(targetUserId: string): void {
    socketService.emit('send_friend_request', { targetUserId });
  }

  acceptRequest(friendId: string): void {
    socketService.emit('accept_friend_request', { friendId });
  }

  rejectRequest(friendId: string): void {
    socketService.emit('reject_friend_request', { friendId });
  }

  cancelRequest(friendId: string): void {
    socketService.emit('cancel_friend_request', { friendId });
  }

  removeFriend(friendId: string): void {
    socketService.emit('remove_friend', { friendId });
  }

  searchUsers(query: string): Promise<SearchUsersResult> {
    return new Promise((resolve) => {
      const sock = socketService.getSocket();
      const onResult = (data: SearchUsersResult) => {
        sock.off('search_users_result', onResult);
        resolve(data);
      };
      sock.once('search_users_result', onResult);
      sock.emit('search_users', { query });
      setTimeout(() => {
        sock.off('search_users_result', onResult);
        resolve({ query, users: [] });
      }, 5000);
    });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  onNotification(listener: NotifListener): () => void {
    this.notifListeners.add(listener);
    return () => this.notifListeners.delete(listener);
  }

  // ============== INTERNALS ==============
  private wirePushEvents(): void {
    if (this.wired) return;
    this.wired = true;

    socketService.on<FriendRequestReceivedEvent>('friend_request_received', (data) => {
      this.state = {
        ...this.state,
        pending: [
          ...this.state.pending,
          { id: data.from.id, username: data.from.username, timestamp: data.timestamp },
        ],
      };
      this.notify();
      this.notifyToast(`${data.from.username} te enviou um pedido de amizade.`, 'request');
    });

    socketService.on<FriendAddedEvent>('friend_added', (data) => {
      this.notifyToast(`${data.friend.username} aceitou seu pedido de amizade!`, 'added');
      void this.refreshFriends();
      void this.refreshRequests();
    });

    socketService.on<FriendRequestRejectedByUserEvent>('friend_request_rejected_by_user', (data) => {
      this.state = {
        ...this.state,
        sent: this.state.sent.filter((s) => s.id !== data.userId),
      };
      this.notify();
    });

    socketService.on<FriendRemovedByUserEvent>('friend_removed_by_user', () => {
      this.notifyToast('Um amigo removeu você da lista.', 'removed');
      void this.refreshFriends();
    });

    // Presence em tempo real (AuthHandler emite quando amigo conecta/desconecta)
    socketService.on<FriendPresenceEvent>('friend_online', (data) => {
      this.applyPresence(data.userId, true);
      const username = data.username ?? this.state.friends.find((f) => f.id === data.userId)?.username;
      if (username) this.notifyToast(`${username} está online.`, 'added');
    });
    socketService.on<FriendPresenceEvent>('friend_offline', (data) => {
      this.applyPresence(data.userId, false);
    });

    // Erros vão pro log; UI mostra via toast caso precise
    socketService.on<FriendErrorEvent>('friend_error', (err) => {
      log.warn('FriendsService: server error', { msg: err.message, code: err.code });
      this.notifyToast(err.message, 'rejected');
    });

    // Reações às próprias ações (success) — refetch
    socketService.on('friend_request_sent', () => void this.refreshRequests());
    socketService.on('friend_request_accepted', () => {
      void this.refreshFriends();
      void this.refreshRequests();
    });
    socketService.on('friend_request_rejected', () => void this.refreshRequests());
    socketService.on('friend_request_cancelled', () => void this.refreshRequests());
    socketService.on('friend_removed', () => {
      void this.refreshFriends();
    });
  }

  private notify(): void {
    for (const l of this.listeners) l(this.state);
  }

  /** Atualiza isOnline de um amigo específico — usado pelos eventos de presence. */
  private applyPresence(userId: string, isOnline: boolean): void {
    const idx = this.state.friends.findIndex((f) => f.id === userId);
    if (idx === -1) return;
    const updated = [...this.state.friends];
    updated[idx] = { ...updated[idx]!, isOnline };
    this.state = { ...this.state, friends: updated };
    this.notify();
  }

  private notifyToast(msg: string, kind: 'request' | 'added' | 'removed' | 'rejected'): void {
    for (const l of this.notifListeners) l(msg, kind);
  }
}

export const friendsService = new FriendsService();
