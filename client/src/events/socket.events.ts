/**
 * Tipagens de payloads dos eventos Socket.IO consumidos do backend `servicoFrontendSocket`.
 * Mantém em sync com:
 * - servicoFrontendSocket/src/handlers/AuthHandler.js
 * - servicoFrontendSocket/src/handlers/RoomHandler.js
 * - servicoFrontendSocket/src/handlers/MafiaGameHandler.js
 * - servicoFrontendSocket/src/handlers/LobbyMovementHandler.js
 *
 * Cresce conforme tasks (3 = auth, 4 = lobby/preroom, 6+ = game/mafia).
 */

// ============== AUTH ==============
export type AuthRegisterPayload = {
  username: string;
  password: string;
  email?: string;
};

export type AuthLoginPayload = {
  username: string;
  password: string;
};

export type AuthAuthenticatePayload = {
  token: string;
};

export type SilenceUser = {
  userId: string;
  username: string;
  email?: string;
  // outros campos chegam dependendo do handler — usar `unknown` quando ler novos
  [key: string]: unknown;
};

export type AuthLoginResult =
  | {
      success: true;
      message?: string;
      token: string;
      expiresAt: number;
      expiresIn?: number;
      user: SilenceUser;
      userId: string;
    }
  | {
      success: false;
      message: string;
    };

export type AuthRegisterResult =
  | { success: true; message?: string; user: SilenceUser; userId: string }
  | { success: false; message: string };

export type AuthAuthenticateResult =
  | {
      success: true;
      message?: string;
      userId: string;
      user: SilenceUser;
      expiresAt: number;
    }
  | { success: false; message: string };

// ============== ROOM ==============
export type RoomCreatePayload = {
  name: string;
  gameMode?: string;
  maxPlayers?: number;
  isPrivate?: boolean;
  description?: string;
};

export type RoomJoinPayload = { roomId: string };
export type RoomChatPayload = { message: string };

export type RoomCharacter = {
  name?: string;
  person?: string;
  skins?: unknown;
};

export type RoomPlayer = {
  userId: string;
  username: string;
  isReady: boolean;
  character: RoomCharacter | null;
};

export type RoomSummary = {
  id: string;
  name: string;
  gameMode: string;
  maxPlayers: number;
  isPrivate: boolean;
  description: string;
  hostId: string;
  players: RoomPlayer[];
  playerCount: number;
  status: 'waiting' | 'playing' | 'finished';
  createdAt: number;
};

export type RoomListResult = { rooms: RoomSummary[] };
export type RoomCreatedResult = { room: RoomSummary };
export type RoomJoinedResult = { room: RoomSummary };
export type RoomLeftResult = void;
export type RoomPlayerJoinedEvent = { player: RoomPlayer; room: RoomSummary };
export type RoomPlayerLeftEvent = {
  userId: string;
  username: string;
  kicked?: boolean;
  room: RoomSummary;
};
export type RoomReadyUpdatedEvent = { userId: string; isReady: boolean; room: RoomSummary };
export type RoomGameStartedEvent = { room: RoomSummary };
export type RoomChatMessageEvent = {
  userId: string;
  username: string;
  message: string;
  timestamp: number;
};
export type RoomErrorEvent = { message: string };

// ============== PREROOM (walkable lobby) ==============
// Coords em PORCENTAGEM (0-100) — backend clampa e revalida
export type PreroomMovePayload = { x: number; y: number };
export type PreroomPlayerMovedEvent = { userId: string; x: number; y: number };
export type PreroomPositionEntry = { userId: string; x: number; y: number };
export type PreroomLobbyStateEvent = { positions: PreroomPositionEntry[] };

// ============== GAME (walkable in-game) ==============
// Mesmo contrato do PREROOM mas para a fase de jogo (handler GameMovementHandler).
export type GameMovePayload = { x: number; y: number };
export type GamePlayerMovedEvent = { userId: string; x: number; y: number };
export type GamePositionEntry = { userId: string; x: number; y: number };
export type GamePlayersStateEvent = { positions: GamePositionEntry[] };

// ============== MAFIA (gameplay loop) ==============
export type MafiaPhase =
  | 'LOBBY'
  | 'ROLE_ASSIGNMENT'
  | 'DAY_DISCUSSION'
  | 'VOTING'
  | 'NIGHT'
  | 'END';

export type MafiaTeam = 'VILLAGE' | 'WEREWOLF' | 'SOLO' | 'NEUTRAL';

export type MafiaRoleInfo = {
  name?: string;
  team?: MafiaTeam;
  description?: string;
  abilities?: unknown;
  [key: string]: unknown;
};

export type MafiaTeammate = {
  playerId: string;
  username?: string;
  role?: string;
};

export type MafiaGameStartedEvent = {
  playerCount: number;
  dayNumber: number;
  phase: MafiaPhase;
};

export type MafiaPhaseChangedEvent = {
  phase: MafiaPhase;
  dayNumber: number;
  duration: number;
  timestamp: number;
};

export type MafiaTimerUpdateEvent = {
  // backend emite ambos `timeLeft`/`time` em alguns paths e `remainingTime` em outros
  timeLeft?: number;
  time?: number;
  remainingTime?: number;
  phase: MafiaPhase;
};

export type MafiaRoleAssignedEvent = {
  role: string;
  roleInfo: MafiaRoleInfo;
  teammates?: MafiaTeammate[];
};

export type MafiaPlayerDiedEvent = {
  playerId: string;
  playerName?: string;
  username?: string;
  role?: string;
  cause?: string;
  dayNumber?: number;
};

// ============== VOTE ==============
export type MafiaVotePayload = { targetId: string };

export type MafiaVoteReceivedEvent = {
  voterId: string;
  targetId: string | null;
  voteCount?: number;
  skipped?: boolean;
};

export type MafiaVoteResultEvent = {
  eliminated: string | null;
  eliminatedName: string | null;
  eliminatedRole?: string;
  counts: Record<string, number>;
  tie?: boolean;
};

// ============== ABILITY ==============
export type MafiaActionType =
  | 'KILL'
  | 'PROTECT'
  | 'BLOCK'
  | 'CHECK'
  | 'CONVERT'
  | 'HEAL'
  | 'POISON'
  | 'SILENCE'
  | 'VOTE'
  | 'SKIP'
  | 'OTHER';

export type MafiaUseAbilityPayload = {
  actionType: MafiaActionType;
  targetId: string;
};

export type MafiaAbilityResultEvent = {
  type?: string;
  message?: string;
  feedback?: unknown;
  result?: {
    targetId?: string;
    targetName?: string;
    role?: string;
    team?: MafiaTeam;
    [key: string]: unknown;
  };
};

// ============== NIGHT RESULTS ==============
export type MafiaNightDeath = {
  playerId: string;
  playerName?: string;
  role?: string;
  cause?: string;
};

export type MafiaNightResultsEvent = {
  deaths: MafiaNightDeath[];
  dayNumber?: number;
};

// ============== SETTINGS ==============
// Espelha SettingsHandler do backend. Backend sanitiza/clampa.
export type SettingsState = {
  soundEnabled: boolean;
  musicEnabled: boolean;
  soundVolume: number; // 0..1
  musicVolume: number; // 0..1
  bgLobby: number; // 1..10 (id do cenário)
  showChatTimestamps: boolean;
  gameNotifications: boolean;
  autoSkipVote: boolean;
  animationsEnabled: boolean;
  // Configuração avançada (gráficos/exibição) — guardamos como genérico por enquanto
  configuration?: Record<string, unknown>;
};

export type SettingsGetResult = { success: true; settings: SettingsState } | { success: false; message: string };
export type SettingsUpdatePayload = Partial<SettingsState>;
export type SettingsUpdateResult = { success: true } | { success: false; message: string };

// ============== CHARACTER ==============
// Backend usa underscore (CharacterHandler.js): update_character → character_updated,
// get_character → character_data. Falhas vêm em character_update_error / character_get_error.
export type CharacterPayload = {
  name?: string; // skin id (ex: 'crimson')
  person?: string; // caminho do retrato base
  skins?: Record<string, string | null>; // hat/hair/clothes/...
};

export type CharacterPersisted = {
  userId: string;
  name: string;
  person: string;
  skins: Record<string, string | null>;
  updatedAt: string;
};

export type CharacterUpdatedEvent = { success: boolean; character: CharacterPersisted };
export type CharacterDataResult =
  | { success: true; character: CharacterPersisted }
  | { success: false; message: string };
export type CharacterErrorEvent = { message: string; error?: string };

// ============== STATS ==============
// Backend usa underscore (StatsHandler.js): get_user_stats → user_stats,
// get_match_history → match_history, get_leaderboard → leaderboard.
export type UserStats = {
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: string; // armazenado como string "50.00"
  totalPlayTime: number; // segundos
  kills: number;
  deaths: number;
  rolesPlayed: Record<string, number>;
  favoriteRole: string | null;
  longestWinStreak: number;
  currentWinStreak: number;
  votesCorrect?: number;
  votesWrong?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type MatchHistoryEntry = {
  matchId: string;
  role?: string;
  result?: 'win' | 'loss';
  kills?: number;
  duration?: number;
  endedAt?: string;
  [key: string]: unknown;
};

export type GetUserStatsPayload = { userId?: string };
export type UserStatsResult = { stats: UserStats } | { error: string };
export type GetMatchHistoryPayload = { limit?: number; offset?: number };
export type MatchHistoryResult =
  | { matches: MatchHistoryEntry[]; total: number; hasMore: boolean }
  | { error: string };
export type StatsErrorEvent = { message?: string; error?: string };

// ============== FRIENDS ==============
// Backend usa underscore (FriendHandler.js).
export type FriendEntry = {
  id: string;
  username: string;
  isOnline: boolean;
  character?: RoomCharacter | null;
};

export type FriendRequestEntry = {
  id: string;
  username: string;
  timestamp: number;
};

export type FriendRequestsList = {
  pending: FriendRequestEntry[];
  sent: FriendRequestEntry[];
};

export type SearchUserEntry = {
  id: string;
  userId: string;
  username: string;
  profile?: unknown;
  isFriend: boolean;
  hasSentRequest: boolean;
  hasPendingRequest: boolean;
};

export type SearchUsersResult = {
  query: string;
  users: SearchUserEntry[];
  error?: string;
};

export type FriendErrorEvent = { message: string; code?: string };

// Push events do servidor
export type FriendRequestReceivedEvent = {
  from: { id: string; username: string };
  timestamp: number;
};
export type FriendAddedEvent = { friend: { id: string; username: string }; message?: string };
export type FriendRequestRejectedByUserEvent = { userId: string };
export type FriendRemovedByUserEvent = { userId: string };
export type FriendPresenceEvent = { userId: string; username?: string };

// ============== ACHIEVEMENTS ==============
// Backend usa underscore (AchievementHandler.js).
export type AchievementRarity = 'comum' | 'raro' | 'épico' | 'lendário';

export type Achievement = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  rarity: AchievementRarity;
  requirement: { type: string; value: number; role?: string };
  reward?: { coins?: number; diamonds?: number };
  unlocked?: boolean;
};

export type AchievementsResult = {
  achievements: Achievement[];
  total: number;
  unlocked: number;
};

export type AchievementUnlockedEvent = { achievements: Achievement[] };
export type AchievementsErrorEvent = { message: string };

// ============== SHOP ==============
// Backend usa underscore (ShopHandler.js).
export type ShopCurrency = 'coins' | 'diamonds';
export type ShopItemRarity = 'comum' | 'raro' | 'épico' | 'lendário';
export type ShopCategory = 'skins' | 'hats' | 'weapons' | 'wings';

export type ShopItem = {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: ShopCurrency;
  category: ShopCategory | string;
  rarity: ShopItemRarity;
  emoji: string;
  owned?: boolean;
};

export type GetShopItemsPayload = { category?: string };
export type ShopItemsResult = { items: ShopItem[]; category: string };
export type PurchaseItemPayload = { itemId: string };
export type PurchaseSuccessEvent = {
  item: ShopItem;
  balance: { coins: number; diamonds: number };
  message: string;
};
export type PurchaseErrorEvent = {
  message: string;
  required?: number;
  current?: number;
};
export type UserBalanceResult = { coins: number; diamonds: number };
export type OwnedItemsResult = {
  items: Array<{
    itemId: string;
    itemName: string;
    category: string;
    price: number;
    currency: ShopCurrency;
    purchasedAt: string;
  }>;
  count: number;
};
export type ShopErrorEvent = { message: string };
