import express from "express";

const router = express.Router();

router.get("/", (req, res) => {
  res.send("我是 line_bot 機器人_測試");
});

export default router;