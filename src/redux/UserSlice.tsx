import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

export interface User {
  id: string; // Prisma uses id
  _id?: string; // Fallback for some parts of frontend 
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  roleId: number;
  role: {
    name: string;
    displayName: string;
    hierarchyLevel: number;
  };
  /** Sales team membership (API may return string or number) */
  teamId?: string | number | null;
  createdAt: string;
  updatedAt: string;
}

interface UserState {
  user: User | null;
  token: string | null;
}

const storedUser = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
const storedToken = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

const initialState: UserState = {
  user: storedUser ? JSON.parse(storedUser) : null,
  token: storedToken,
};

const UserSlice = createSlice({
  name: "user",
  initialState,
  reducers: {
    login: (
      state,
      action: PayloadAction<{ user: User; token: string | null }>
    ) => {
      state.user = action.payload.user;
      state.token = action.payload.token;
      if (action.payload.user) {
        localStorage.setItem('user', JSON.stringify(action.payload.user));
      }
      if (action.payload.token) {
        localStorage.setItem('token', action.payload.token);
      }
    },
    logout: (state) => {
      state.user = null;
      state.token = null;
      localStorage.removeItem('user');
      localStorage.removeItem('token');
    },
  },
});

export const { login, logout } = UserSlice.actions;
export default UserSlice.reducer;

