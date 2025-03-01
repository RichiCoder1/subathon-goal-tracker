import usePartySocket from 'partysocket/react';
import { useEffect, useState } from 'react';
import day from 'dayjs';
import duration from 'dayjs/plugin/duration';
import './Overlay.css';
import { type Goal, ServerMessageSchema, type Increments } from '@subathon-goal-tracker/messages/schema';
import { parse } from 'superjson';

day.extend(duration);

export const Overlay = (props: { host: string; room: string }) => {
    const { host, room } = props;

    const [isTimerActive, setTimerActive] = useState(false);
    const [timeLeft, setTimeLeft] = useState(0);
    const [increments, setIncrements] = useState<Increments>({
        tier1: [],
        tier2: [],
        tier3: [],
        bits: [],
    });
    const [goals, setGoals] = useState<Goal[]>([]);

    const [showAlert, setShowAlert] = useState(false);

    const ws = usePartySocket({
        host,
        room,
        onMessage(e) {
            console.log('message', e.data);
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
                    case 'subathon.tick': {
                        setTimeLeft(message.remainingTimeInSeconds);
                    }
                }
            } catch (e) {
                console.error(`Failed to parse message`, e);
            }
        },
        onError(e) {
            console.error('error', e);
        },
    });

    const remainingDuration = day.duration(timeLeft, 'seconds');

    const formattedTime = `${Math.floor(remainingDuration.asHours())
        .toString()
        .padStart(2, '0')}:${remainingDuration.format('mm:ss')}`;

    let currentSubs =
        increments.tier1.reduce((current, increment) => current + increment.value, 0) +
        increments.tier2.reduce((current, increment) => current + increment.value, 0) +
        increments.tier3.reduce((current, increment) => current + increment.value, 0);
    let goal = goals.toSorted((a, b) => a.target - b.target).find((goal) => goal.target > currentSubs);

    return (
        <div className="subathon-screen flex w-screen h-screen bg-[#7edeff] p-2 items-center justify-center">
            <div id="subathon-container" className="flex flex-col justify-center items-center">
                {!isTimerActive ? (
                    <div className="z-10 absolute flex gap-4 items-center justify-center top-0 left-0 bottom-0 right-0">
                        <div className="-z-10 absolute w-24 h-24 opacity-50 rounded-full bg-zinc-800"></div>
                        <div className="w-4 h-16 rounded-md border-2 border-black bg-white shadow"></div>
                        <div className="w-4 h-16 rounded-md border-2 border-black bg-white shadow"></div>
                    </div>
                ) : null}
                <div className="flex flex-1/3 justify-end pb-1 min-h-8 max-w-[300px]">
                    {showAlert ? <span>Test Alert</span> : null}
                </div>
                <div className="relative flex-1/3 font-outline-3 font-outline-black text-5xl tracking-wider text-[#fdff42] w-[7ch] self-center">
                    {formattedTime}
                </div>
                <div className="flex-1/3 pt-1 text-center">
                    {goal ? (
                        <span className="font-outline-2 font-outline-black text-white text-[1.8rem] whitespace-break-spaces">
                            Next Goal:{' '}
                            <span>
                                {goal.name}
                            </span>
                            <br/>
                            <span>{'   '}at {goal.target} subs</span>
                        </span>
                    ) : null}
                </div>
            </div>
        </div>
    );
};
