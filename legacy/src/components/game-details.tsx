'use client'

import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Star } from 'lucide-react'
import { motion } from 'framer-motion'
import { GameList, useGameListsStore } from "@/stores/useGameListsStore";


import { Game } from '@/types/Game' // ajuste o path se necessário
import { useMemo } from 'react'

interface GameDetailsProps {
  game: Game
  lists: GameList[]
}

export default function GameDetails({ game, lists }: GameDetailsProps) {


  const { resolveGameLists } = useGameListsStore();
const resolvedLists = useMemo(() => {
  if (!game.player_data.listIds?.length) return [];
  return resolveGameLists(game.player_data.listIds);
}, [game.player_data.listIds, resolveGameLists]);




  console.log("resolvedLists ==>",resolvedLists) //==>[]
  return (
    <>


      <div className="min-h-screen text-white mt-5">
        {/* HEADER */}
        <div className="relative w-full h-[50vh] overflow-hidden">
          {game?.game_data?.cover && (
            <Image
              src={game?.game_data?.cover.url}
              alt={game?.game_data?.name}
              fill
              className="object-cover opacity-30 blur-sm"
              priority
            />
          )}

          <div className="absolute inset-0 flex flex-col md:flex-row items-center gap-6 md:gap-12 px-6 md:px-16">
            {game?.game_data?.cover && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="relative w-72 h-96 shadow-2xl rounded-lg overflow-hidden border border-slate-800"
              >
                <Image
                  src={game?.game_data?.cover.url}
                  alt={game?.game_data?.name}
                  fill
                  className="object-cover"
                  priority
                />
              </motion.div>
            )}

            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <h1 className="text-5xl font-bold mb-3">
                {game?.game_data?.name}
              </h1>

              <p className="text-slate-200 text-sm mb-2">
                Lançamento: {game?.game_data?.release_date}
              </p>



              <p className="mt-5 text-lg leading-relaxed max-w-2xl">
                {game?.game_data?.summary}
              </p>
            </motion.div>
          </div>
        </div>

        {/* CONTEÚDO */}
        <div className="mx-auto px-6 md:px-10 py-10">
          <div className="flex flex-col md:flex-row gap-8">
            {/* Progresso */}
            
    <Card className="flex-1 border-slate-800 p-6">
              <h2 className="text-xl font-semibold mb-4 text-slate-100">
                Dados do jogo
              </h2>

              <div className="space-y-2 text-slate-300">


              <p className="text-slate-200  mb-2">
                <strong>Lançamento:</strong> {game?.game_data?.release_date}
              </p>

              {game?.game_data?.genres && (
                <p className="text-slate-200  mb-2">
                <strong>Gêneros:</strong>  {game?.game_data?.genres}
                </p>
              )}


              {game?.game_data?.platforms && (
                <p className="text-slate-200  mb-2">
                 <strong>Plataformas:</strong>  {game?.game_data?.platforms}
                </p>
              )}

              {game?.game_data?.developers && (
                <p className="text-slate-200  mb-2">
                <strong>Desenvolvedoras:</strong>   {game?.game_data?.developers}
                </p>
              )}


              {game?.game_data?.publishers && (
                <p className="text-slate-200  mb-2">
                 <strong>Publisher:</strong>  {game?.game_data?.publishers}
                </p>
              )}

 
              </div>
            </Card>

            
        
       <Card className="flex-1 border-slate-800 p-6">
              <h2 className="text-xl font-semibold mb-4 text-slate-100">
                Progresso do Jogador
              </h2>

              <div className="space-y-2 text-slate-300">
                <p>
                  <strong>Status:</strong> {game?.player_data?.status}
                </p>

                <p>
                  <strong>Horas jogadas:</strong> {game?.player_data?.hours_played}h
                </p>

                {game?.player_data?.times_finished !== undefined && (
                  <p>
                    <strong>Vezes zerado:</strong> {game?.player_data?.times_finished}
                  </p>
                )}

                {game?.player_data?.rating !== undefined && (
                  <p className="flex items-center gap-2">
                    <strong>Nota pessoal:</strong>
                    <span className="flex items-center text-yellow-400">
                      <Star className="w-4 h-4 fill-yellow-400 mr-1" />
                      {game?.player_data?.rating}
                    </span>
                  </p>
                )}

                {game?.player_data?.listIds && game?.player_data?.listIds.length > 0 && (
                  <>
                    <Separator className="my-3 bg-slate-700" />
                    <div>
                      <strong>Listas:</strong>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {resolvedLists.map(list => (
                          <Badge key={list._id}>{list.name}</Badge>
                        ))}

                      </div>
                    </div>
                  </>
                )}
              </div>
            </Card>

        
     
     
          </div>
                      {/* Review */}
                <div>
       {game?.player_data?.review && (
              <Card className="flex flex-col my-5 border-slate-800 p-6">
                <h2 className="text-xl font-semibold text-slate-100 mb-4">
                  Review Pessoal
                </h2>
                <p className="text-slate-300 text-lg leading-relaxed">
                  {game?.player_data?.review}
                </p>
              </Card>
            )}
                </div>
        </div>
      </div>
    </>
  )
}
