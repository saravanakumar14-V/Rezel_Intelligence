type Props = {
  message: string;
};

export default function BootMessages({ message }: Props) {
  return (
    <p className="mt-8 text-cyan-200 tracking-widest">
      {message}
    </p>
  );
}