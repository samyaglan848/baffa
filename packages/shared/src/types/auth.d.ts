export interface UserProfile {
    id: string;
    username: string;
    email?: string;
    displayName: string;
    avatarUrl: string;
    totalMatches: number;
    matchesWon: number;
    totalRounds: number;
    roundsWon: number;
    totalPipsScored: number;
    createdAt: string;
}
export interface AuthSession {
    user: UserProfile;
    token?: string;
}
