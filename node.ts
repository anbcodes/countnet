import { readFileSync } from "fs";
import { writeFile } from "fs/promises";
import { Server, Socket } from "net";
import { createInterface } from "readline";

const pageSize = 100;

let state = {
  num: 0,
  by: "",
  history: [] as [number, string, number][],
  scores: {} as { [ip: string]: number },
};
try {
  const file = readFileSync("state.json").toString();
  state = JSON.parse(file);
} catch (e) {
  console.log("Creating new save file");
}

let saved = false;
setInterval(() => {
  if (!saved) {
    saved = true;
    writeFile("state.json", JSON.stringify(state));
  }
}, 1000 * 15);

const helpmsg = `CountNet - How to Use
Type the next number in the sequence to enter it and you can also use the following commands.
* help - display this message
* history [page #] - display past messages
* score - show your score
* top - show the top ten scores
* online - show who's connected right now
* who - show who you are
`.replaceAll("\n", "\r\n");

let connections: Socket[] = [];

const broadcast = (str: string) => {
  connections.forEach((conn) => conn.write(str));
};

const server = new Server((conn) => {
  try {
    const ip = conn.remoteAddress;
    if (!ip) {
      conn.write("Error: No remote address found\r\n");
      conn.end();
      return;
    }

    connections.push(conn);
    conn.on("close", () => {
      connections = connections.filter((v) => v !== conn);
    });

    console.log(ip, "connected");
    conn.write(
      `Welcome to CountNet, ${ip}. The last number was ${state.num} by ${state.by}\r\n`,
    );
    conn.write(
      `Enter the next number. Other commands: history, help, score, top, online, who\r\n`,
    );

    let i = createInterface(conn, conn);
    i.on("line", function (rawline) {
      const parsed = parseInt(rawline);
      const line = rawline.split(" ");
      if (!isNaN(parsed)) {
        if (state.by === ip) {
          conn.write(`You can't speak twice in a row\r\n`);
        } else if (parsed == state.num + 1) {
          state.num++;
          state.by = ip;
          state.history.push([state.num, ip, +new Date()]);

          if (!state.scores[ip]) state.scores[ip] = 0;
          state.scores[ip] += 1;

          saved = false;

          broadcast(`The count is now ${state.num}!\r\n`);
        } else {
          conn.write(`${parsed} is the wrong number!\r\n`);
        }
      } else if (line[0] === "help") {
        conn.write(helpmsg);
      } else if (line[0] === "history") {
        let page = parseInt(line[1]);
        page = isNaN(page) ? 0 : page;

        conn.write(`History (page ${page})\r\n`);
        state.history
          .slice(
            -pageSize * (page + 1),
            page === 0 ? undefined : -pageSize * page,
          )
          .forEach((msg) => {
            conn.write(`${msg[1]}: ${msg[0]}\r\n`);
          });

        if ((page + 1) * pageSize > state.history.length) {
          conn.write(`You've reached the end!\r\n`);
        } else {
          conn.write(
            `that was page ${page}, use history ${
              page + 1
            } to get the next page\r\n`,
          );
        }
      } else if (line[0] === "score") {
        const scores = Object.entries(state.scores).sort((a, b) => b[1] - a[1]);
        const index = scores.findIndex(([scoreIp]) => scoreIp === ip);

        conn.write(
          `Your score is ${state.scores[ip] ?? 0}. Rank #${
            (index + 1) || "?"
          }\r\n`,
        );
        scores.map((v, i) => [...v, i]).slice(Math.max(index - 5, 0), index + 5)
          .forEach(
            ([scoreIp, count, place]) => {
              conn.write(scoreIp === ip ? "-> " : "   ");
              conn.write(`${place as number + 1}. ${scoreIp}: ${count}\r\n`);
            },
          );
      } else if (line[0] === "online") {
        conn.write(`Currently online:\r\n`);
        conn.write(connections.map((v) => v.remoteAddress).join(" ") + "\r\n");
      } else if (line[0] === "who") {
        conn.write(`You are ${ip}\r\n`);
      } else if (line[0] === "top") {
        conn.write(`The top ten scores are\r\n`);
        const scores = Object.entries(state.scores).sort((a, b) => b[1] - a[1]);

        scores.slice(0, 10).forEach((score, i) => {
          conn.write(
            `${(i + 1).toString().padStart(2, " ")}. ${score[0]}: ${
              score[1]
            }\r\n`,
          );
        });
      } else {
        conn.write(
          `Invalid command. Commands: history, help, score, top, online, who\r\n`,
        );
      }
    });
  } catch (e) {
    console.error("An error occured", e);
    conn.write("An error occured, sorry.\r\n");
    conn.end();
    connections = connections.filter((v) => v !== conn);
    return;
  }
});

server.listen(27272, "0.0.0.0");
