// Package entry point: re-export the generated client plus the hand-written XSSI
// middleware. The generated code lives in src/ (regenerated wholesale by generate.sh);
// this barrel and xssi.ts are hand-written and survive regeneration.
export * from './src';
export { gerritXssiMiddleware, strip } from './xssi';
