import {
    ServerMessageSchema,
    type ClientMessage,
    type Goal,
    type Increments,
} from '@subathon-goal-tracker/messages/schema';
import usePartySocket from 'partysocket/react';
import { useEffect, useState } from 'react';
import { parse, stringify } from 'superjson';
import day from 'dayjs';
import duration from 'dayjs/plugin/duration';
import type { Session } from '@auth/core/types';
import { TableBody } from 'react-aria-components';
import { Button } from '../ui/Button';
import { Cell, Column, Row, Table, TableHeader } from '../ui/Table';
import { TextField } from '../ui/TextField';
import { Form } from '../ui/Form';
import { NumberField } from '../ui/NumberField';

day.extend(duration);

export function SettingsPage(props: {
    host: string;
    room: string;
    session: Session | null;
    broadcasterId: string;
    callbackOverride: string | null;
}) {
    const { host, room, broadcasterId, callbackOverride, session } = props;

    const [isTimerActive, setTimerActive] = useState(false);
    const [timeLeft, setTimeLeft] = useState(0);
    const [increments, setIncrements] = useState<Increments>({
        tier1: [],
        tier2: [],
        tier3: [],
        bits: [],
    });
    const [goals, setGoals] = useState<Goal[]>([]);

    const [subscriptions, setSubscriptions] = useState<any[] | null>(null);

    const ws = usePartySocket({
        host,
        room,
        query: async () => ({
            userId: session?.user?.id,
        }),
        onMessage(e) {
            console.debug('message', e.data);
            try {
                const parsedMessage = parse(e.data);
                const message = ServerMessageSchema.parse(parsedMessage);
                switch (message.type) {
                    case 'subathon.updated':
                        {
                            setTimeLeft(message.remainingTimeInSeconds);
                            setIncrements(message.increments);
                            setGoals(message.goals);
                            setTimerActive(message.pausedAt == null);
                        }
                        break;
                    case 'subathon.tick':
                        {
                            setTimeLeft(message.remainingTimeInSeconds);
                        }
                        break;
                    case 'subathon.twitch.subscriptions':
                        {
                            setSubscriptions(message.subscriptions);
                        }
                        break;
                }
            } catch (e) {
                console.error(`Failed to parse message`, e);
            }
        },
        onError(e) {
            console.error('error', e);
        },
    });

    function sendMessage(message: ClientMessage) {
        ws.send(stringify(message));
    }

    useEffect(() => {
        if (ws.readyState === ws.OPEN) {
            sendMessage({
                type: 'subathon.twitch.subscriptions.get',
            });
        }
    }, [ws, ws.readyState]);

    let roomUrl = ws.roomUrl.replace(/ws(s)?/, 'http$1');
    if (callbackOverride) {
        roomUrl = `https://${callbackOverride}/parties/main/${room}`;
    }

    const isTwitchConfigured =
        subscriptions &&
        subscriptions.length > 0 &&
        subscriptions.some((s) => s.condition?.broadcaster_user_id == broadcasterId);

    const remainingDuration = day.duration(timeLeft, 'seconds');

    const formattedTime = `${Math.floor(remainingDuration.asHours())
        .toString()
        .padStart(2, '0')}:${remainingDuration.format('mm:ss')}`;

    const calculatedTotals = [
        ...increments.tier1.map((i) => ({ type: 'Sub (Tier 1)', ...i })),
        ...increments.tier2.map((i) => ({ type: 'Sub (Tier 2)', ...i })),
        ...increments.tier3.map((i) => ({ type: 'Sub (Tier 3)', ...i })),
        ...increments.bits.map((i) => ({ type: 'Bits', ...i })),
    ];

    return (
        <div>
            <main className="m-4 flex flex-col gap-4">
                <h1 className="text-4xl font-semibold">Settings</h1>
                <div>
                    <h2 className="text-2xl font-semibold">Twitch</h2>
                    {subscriptions != null ? (
                        isTwitchConfigured ? (
                            <div>
                                <div className="py-2">Twitch is connected!</div>
                                <Button
                                    onPress={() => {
                                        sendMessage({
                                            type: 'subathon.twitch.subscriptions.remove',
                                            broadcasterId,
                                        });
                                        setSubscriptions([]);
                                    }}
                                >
                                    Disconnect
                                </Button>
                            </div>
                        ) : (
                            <div>
                                <div className="py-2">Twitch is not connected.</div>
                                <Button
                                    onPress={() => {
                                        sendMessage({
                                            type: 'subathon.twitch.subscriptions.create',
                                            callbackUrl: roomUrl,
                                            broadcasterId,
                                        });
                                    }}
                                >
                                    Connect
                                </Button>
                            </div>
                        )
                    ) : (
                        <div>Loading status...</div>
                    )}
                </div>
                <div>
                    <h2 className="text-xl font-semibold">Remaining Timer</h2>
                    <div className="py-2">
                        <span className="text-lg ">{formattedTime}</span>
                    </div>
                    <div className="flex gap-1">
                        <Button
                            onPress={() => {
                                sendMessage({
                                    type: 'subathon.start',
                                });
                            }}
                        >
                            Start Timer
                        </Button>
                        <Button
                            onPress={() => {
                                sendMessage({
                                    type: 'subathon.pause',
                                    pausedAt: new Date().valueOf(),
                                });
                            }}
                        >
                            Stop Timer
                        </Button>
                        <Button
                            onPress={() => {
                                sendMessage({
                                    type: 'subathon.reset',
                                    remainingTimeInSeconds: 4 * 60 * 60,
                                });
                            }}
                        >
                            Reset Timer
                        </Button>
                    </div>
                    <div className="mt-2">
                        <h3 className="text-xl pb-2">Time Control</h3>
                        <div>
                            <Form onSubmit={e => {
                                e.preventDefault();
                                const data = new FormData(e.currentTarget);
                                const time = data.get("time");
                                sendMessage({
                                    type: "subathon.time.add",
                                    timeInSeconds: Number(time)
                                });
                                e.currentTarget.reset();
                            }}>
                                <NumberField label="Time (Seconds)" isRequired name="time"></NumberField>

                                <div className="flex gap-2">
                                    <Button type="submit">Add Goal</Button>
                                    <Button type="reset" variant="secondary">
                                        Reset
                                    </Button>
                                </div>
                            </Form>
                        </div>
                        <div className="flex gap-1 mt-4">
                            <Button
                                onPress={() => {
                                    sendMessage({
                                        type: 'subathon.time.add',
                                        timeInSeconds: 10,
                                    });
                                }}
                            >
                                +10s
                            </Button>
                            <Button
                                onPress={() => {
                                    sendMessage({
                                        type: 'subathon.time.add',
                                        timeInSeconds: 30,
                                    });
                                }}
                            >
                                +30s
                            </Button>
                            <Button
                                onPress={() => {
                                    sendMessage({
                                        type: 'subathon.time.add',
                                        timeInSeconds: 60,
                                    });
                                }}
                            >
                                +60s
                            </Button>
                            <Button
                                onPress={() => {
                                    sendMessage({
                                        type: 'subathon.time.add',
                                        timeInSeconds: -10,
                                    });
                                }}
                            >
                                -10s
                            </Button>
                            <Button
                                onPress={() => {
                                    sendMessage({
                                        type: 'subathon.time.add',
                                        timeInSeconds: -30,
                                    });
                                }}
                            >
                                -30s
                            </Button>
                            <Button
                                onPress={() => {
                                    sendMessage({
                                        type: 'subathon.time.add',
                                        timeInSeconds: -60,
                                    });
                                }}
                            >
                                -60s
                            </Button>
                        </div>
                    </div>
                </div>
                <div className="mt-4">
                    <h2 className="text-2xl font-semibold pb-4">Goals</h2>
                    <Table>
                        <TableHeader>
                            <Column id="name" defaultWidth={'3fr'} isRowHeader>
                                Name
                            </Column>
                            <Column>Target</Column>
                            <Column defaultWidth={'1fr'}></Column>
                        </TableHeader>
                        <TableBody>
                            {goals.map((goal) => (
                                <Row key={goal.name}>
                                    <Cell>{goal.name}</Cell>
                                    <Cell>{goal.target}</Cell>
                                    <Cell>
                                        <Button
                                            variant="destructive"
                                            onPress={() => {
                                                sendMessage({
                                                    type: 'subathon.goal.remove',
                                                    id: goal.id,
                                                });
                                            }}
                                        >
                                            Remove
                                        </Button>
                                    </Cell>
                                </Row>
                            ))}
                        </TableBody>
                    </Table>
                    <div className="container mt-4">
                        <h3>Add Goal</h3>
                        <Form
                            onSubmit={(e) => {
                                e.preventDefault();
                                const data = new FormData(e.currentTarget);
                                let name = data.get('name');
                                let target = data.get('target');
                                sendMessage({
                                    type: 'subathon.goal.add',
                                    name: name as string,
                                    target: Number(target),
                                });
                                e.currentTarget.reset();
                            }}
                        >
                            <TextField isRequired label="Name" name="name" className="max-w-sm" />
                            <NumberField isRequired label="Target Points" name="target" className="max-w-xs" />
                            <div className="flex gap-2">
                                <Button type="submit">Add Goal</Button>
                                <Button type="reset" variant="secondary">
                                    Reset
                                </Button>
                            </div>
                        </Form>
                    </div>
                </div>
                <div className="mt-4">
                    <h2 className="text-2xl font-semibold pb-4">Rewards</h2>
                    <Table>
                        <TableHeader>
                            <Column id="name" defaultWidth={'3fr'} isRowHeader>
                                Name
                            </Column>
                            <Column>Type</Column>
                            <Column>Amount</Column>
                            <Column defaultWidth={'1fr'}></Column>
                        </TableHeader>
                        <TableBody>
                            {calculatedTotals.map((total) => (
                                <Row key={total.id}>
                                    <Cell>{total.userName}</Cell>
                                    <Cell>{total.type}</Cell>
                                    <Cell>{total.value}</Cell>
                                </Row>
                            ))}
                        </TableBody>
                    </Table>
                    <Button
                        className="mt-2"
                        onPress={() =>
                            sendMessage({
                                type: 'subathon.increments.reset',
                            })
                        }
                    >
                        Reset Totals
                    </Button>
                </div>
            </main>
        </div>
    );
}
