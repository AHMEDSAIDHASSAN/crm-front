import { configureStore } from "@reduxjs/toolkit";
import UserSlice from "./UserSlice";

const Store = configureStore({
  reducer: {
    user: UserSlice
  },
});

export type RootState = ReturnType<typeof Store.getState>;
export type AppDispatch = typeof Store.dispatch;
export default Store;
