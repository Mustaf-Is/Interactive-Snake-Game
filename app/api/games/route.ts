import { getSql } from "@/db";
import { createGameApi } from "@/lib/game-api";

export const dynamic = "force-dynamic";
export const { GET, POST, PUT } = createGameApi(getSql);
