import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests/e2e',timeout:45000,fullyParallel:false,reporter:'list',use:{headless:true,trace:'retain-on-failure'}});
