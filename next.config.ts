import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // компактный продакшн-бандл для Docker-деплоя
  output: "standalone",
  // нативный SQLite для десктоп-сборки — не бандлить в веб
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
