import app from "../server/index";

export default async (req: any, res: any) => {
  // This wrapper ensures that the Express app handles the request correctly in Vercel
  return app(req, res);
};
