import usePartySocket from "partysocket/react";

export const PartyKitTest = (props: { host: string, room: string }) => {
  const { host, room } = props;
  const ws = usePartySocket({
    // usePartySocket takes the same arguments as PartySocket.
    host,
    room,

    // in addition, you can provide socket lifecycle event handlers
    // (equivalent to using ws.addEventListener in an effect hook)
    onOpen() {
      console.log("connected");
    },
    onMessage(e) {
      console.log("message", e.data);
    },
    onClose() {
      console.log("closed");
    },
    onError(e) {
      console.log("error");
    }
  });

  return (
    <div>Test 2</div>
  );
};