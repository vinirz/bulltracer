import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { queueColor } from "@/lib/queue-helpers";
import type { QueueSummary, SeriesPoint } from "@/types";

export function ThroughputChart({
  queues,
  series,
}: {
  queues: QueueSummary[];
  series: SeriesPoint[];
}) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="timeLabel"
            stroke="#52525b"
            tick={{ fill: "#71717a", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#27272a" }}
          />
          <YAxis
            stroke="#52525b"
            tick={{ fill: "#71717a", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={36}
          />
          <RechartsTooltip
            cursor={{ stroke: "#3f3f46", strokeWidth: 1 }}
            contentStyle={{
              background: "#18181b",
              border: "1px solid #27272a",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "#a1a1aa" }}
            formatter={(value, name) => [`${value} jobs/s`, name]}
          />
          {queues.map((queue, index) => (
            <Line
              key={queue.name}
              type="monotone"
              dataKey={queue.name}
              stroke={queueColor(index)}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3.5 }}
              isAnimationActive
              animationDuration={400}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
