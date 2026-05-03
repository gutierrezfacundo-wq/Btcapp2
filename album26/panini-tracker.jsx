import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Check, Plus, Minus, Trophy, RotateCcw, Sparkles, Star, Users, Flame, Hash, Pencil, ArrowRight, X, Search } from 'lucide-react';

// =========================
// DATA
// =========================
const TEAMS_BY_GROUP = {
  A: [
    { code: 'MEX', name: 'México', flag: '🇲🇽', color: '#006847' },
    { code: 'KOR', name: 'Corea del Sur', flag: '🇰🇷', color: '#0F2A6E' },
    { code: 'RSA', name: 'Sudáfrica', flag: '🇿🇦', color: '#007A4D' },
    { code: 'CZE', name: 'Chequia', flag: '🇨🇿', color: '#11457E' },
  ],
  B: [
    { code: 'CAN', name: 'Canadá', flag: '🇨🇦', color: '#D52B1E' },
    { code: 'SUI', name: 'Suiza', flag: '🇨🇭', color: '#DA291C' },
    { code: 'QAT', name: 'Catar', flag: '🇶🇦', color: '#8D1B3D' },
    { code: 'BIH', name: 'Bosnia y Herz.', flag: '🇧🇦', color: '#002F6C' },
  ],
  C: [
    { code: 'BRA', name: 'Brasil', flag: '🇧🇷', color: '#FFCC29' },
    { code: 'MAR', name: 'Marruecos', flag: '🇲🇦', color: '#C1272D' },
    { code: 'SCO', name: 'Escocia', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', color: '#0065BD' },
    { code: 'HAI', name: 'Haití', flag: '🇭🇹', color: '#00209F' },
  ],
  D: [
    { code: 'USA', name: 'EE.UU.', flag: '🇺🇸', color: '#1B2C5C' },
    { code: 'AUS', name: 'Australia', flag: '🇦🇺', color: '#FFCD00' },
    { code: 'PAR', name: 'Paraguay', flag: '🇵🇾', color: '#D52B1E' },
    { code: 'TUR', name: 'Turquía', flag: '🇹🇷', color: '#E30A17' },
  ],
  E: [
    { code: 'GER', name: 'Alemania', flag: '🇩🇪', color: '#1A1A1A' },
    { code: 'ECU', name: 'Ecuador', flag: '🇪🇨', color: '#FFD100' },
    { code: 'CIV', name: 'Costa de Marfil', flag: '🇨🇮', color: '#FF8200' },
    { code: 'CUW', name: 'Curazao', flag: '🇨🇼', color: '#012A87' },
  ],
  F: [
    { code: 'NED', name: 'Países Bajos', flag: '🇳🇱', color: '#FF6900' },
    { code: 'JPN', name: 'Japón', flag: '🇯🇵', color: '#BC002D' },
    { code: 'TUN', name: 'Túnez', flag: '🇹🇳', color: '#E70013' },
    { code: 'SWE', name: 'Suecia', flag: '🇸🇪', color: '#006AA7' },
  ],
  G: [
    { code: 'BEL', name: 'Bélgica', flag: '🇧🇪', color: '#1A1A1A' },
    { code: 'IRN', name: 'Irán', flag: '🇮🇷', color: '#239F40' },
    { code: 'EGY', name: 'Egipto', flag: '🇪🇬', color: '#CE1126' },
    { code: 'NZL', name: 'Nueva Zelanda', flag: '🇳🇿', color: '#222222' },
  ],
  H: [
    { code: 'ESP', name: 'España', flag: '🇪🇸', color: '#AA151B' },
    { code: 'URU', name: 'Uruguay', flag: '🇺🇾', color: '#0038A8' },
    { code: 'KSA', name: 'Arabia Saudita', flag: '🇸🇦', color: '#006C35' },
    { code: 'CPV', name: 'Cabo Verde', flag: '🇨🇻', color: '#003893' },
  ],
  I: [
    { code: 'FRA', name: 'Francia', flag: '🇫🇷', color: '#0055A4' },
    { code: 'SEN', name: 'Senegal', flag: '🇸🇳', color: '#00853F' },
    { code: 'NOR', name: 'Noruega', flag: '🇳🇴', color: '#BA0C2F' },
    { code: 'IRQ', name: 'Irak', flag: '🇮🇶', color: '#CE1126' },
  ],
  J: [
    { code: 'ARG', name: 'Argentina', flag: '🇦🇷', color: '#74ACDF' },
    { code: 'AUT', name: 'Austria', flag: '🇦🇹', color: '#ED2939' },
    { code: 'ALG', name: 'Argelia', flag: '🇩🇿', color: '#006233' },
    { code: 'JOR', name: 'Jordania', flag: '🇯🇴', color: '#1A1A1A' },
  ],
  K: [
    { code: 'POR', name: 'Portugal', flag: '🇵🇹', color: '#046A38' },
    { code: 'COL', name: 'Colombia', flag: '🇨🇴', color: '#FCD116' },
    { code: 'UZB', name: 'Uzbekistán', flag: '🇺🇿', color: '#0099B5' },
    { code: 'COD', name: 'RD Congo', flag: '🇨🇩', color: '#007FFF' },
  ],
  L: [
    { code: 'ENG', name: 'Inglaterra', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', color: '#CE1124' },
    { code: 'CRO', name: 'Croacia', flag: '🇭🇷', color: '#171796' },
    { code: 'PAN', name: 'Panamá', flag: '🇵🇦', color: '#005AA7' },
    { code: 'GHA', name: 'Ghana', flag: '🇬🇭', color: '#FCD116' },
  ],
};

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

const DEFAULT_NAMES = {
  'ALG-2': 'Alexis Guendouz',
  'ALG-3': 'Ramy Bensebaini',
  'ALG-4': 'Youcef Atal',
  'ALG-5': 'Rayan Aït-Nouri',
  'ALG-6': 'Mohamed Amine Tougai',
  'ALG-7': 'Aïssa Mandi',
  'ALG-8': 'Ismael Bennacer',
  'ALG-9': 'Houssem Aquar',
  'ALG-10': 'Hicham Boudaoui',
  'ALG-11': 'Ramiz Zerrouki',
  'ALG-12': 'Nabil Bentalab',
  'ALG-14': 'Farés Chaibi',
  'ALG-15': 'Riyad Mahrez',
  'ALG-16': 'Said Benrahma',
  'ALG-17': 'Anis Hadj Moussa',
  'ALG-18': 'Amine Gouiri',
  'ALG-19': 'Baghdad Bounedjah',
  'ALG-20': 'Mohammed Amoura',
  'ARG-2': 'Emiliano Martinez',
  'ARG-3': 'Nahuel Molina',
  'ARG-4': 'Cristian Romero',
  'ARG-5': 'Nicolas Otamendi',
  'ARG-6': 'Nicolas Tagliafico',
  'ARG-7': 'Leonardo Balerdi',
  'ARG-8': 'Enzo Fernandez',
  'ARG-9': 'Alexis Mac Allister',
  'ARG-10': 'Rodrigo De Paul',
  'ARG-11': 'Exequiel Palacios',
  'ARG-12': 'Leandro Paredes',
  'ARG-14': 'Nico Paz',
  'ARG-15': 'Franco Mastantuono',
  'ARG-16': 'Nico Gonzalez',
  'ARG-17': 'Lionel Messi',
  'ARG-18': 'Lautaro Martinez',
  'ARG-19': 'Julian Alvarez',
  'ARG-20': 'Giuliano Simeone',
  'AUS-2': 'Mathew Ryan',
  'AUS-3': 'Joe Gauci',
  'AUS-4': 'Harry Souttar',
  'AUS-5': 'Alessandro Circati',
  'AUS-6': 'Jordan Bos',
  'AUS-7': 'Aziz Behich',
  'AUS-8': 'Cameron Burgess',
  'AUS-9': 'Lewis Miller',
  'AUS-10': 'Milos Degenek',
  'AUS-11': 'Jackson Irvine',
  'AUS-12': 'Riley McGree',
  'AUS-14': 'Aiden O\'Neill',
  'AUS-15': 'Connor Metcalfe',
  'AUS-16': 'Patrick Yazbek',
  'AUS-17': 'Craig Goodwin',
  'AUS-18': 'Kusini Vengi',
  'AUS-19': 'Nestory Irankunda',
  'AUS-20': 'Mohamed Touré',
  'AUT-2': 'Alexander Schlager',
  'AUT-3': 'Patrick Pentz',
  'AUT-4': 'David Alaba',
  'AUT-5': 'Kevin Danso',
  'AUT-6': 'Philipp Lienhart',
  'AUT-7': 'Stefan Posch',
  'AUT-8': 'Phillipp Mwene',
  'AUT-9': 'Alexander Prass',
  'AUT-10': 'Xaver Schlager',
  'AUT-11': 'Marcel Sabitzer',
  'AUT-12': 'Konrad Laimer',
  'AUT-14': 'Florian Grillitsch',
  'AUT-15': 'Nicolas Seiwald',
  'AUT-16': 'Romano Schmid',
  'AUT-17': 'Patrick Wimmer',
  'AUT-18': 'Christoph Baumgartner',
  'AUT-19': 'Michael Gregoritsch',
  'AUT-20': 'Marko Arnautović',
  'BEL-2': 'Thibaut Courtois',
  'BEL-3': 'Arthur Theate',
  'BEL-4': 'Timothy Castagne',
  'BEL-5': 'Zeno Debast',
  'BEL-6': 'Brandon Mechele',
  'BEL-7': 'Maxim De Cuyper',
  'BEL-8': 'Thomas Meunier',
  'BEL-9': 'Youri Tielemans',
  'BEL-10': 'Amadou Onana',
  'BEL-11': 'Nicolas Raskin',
  'BEL-12': 'Alexis Saelemaekers',
  'BEL-14': 'Hans Vanaken',
  'BEL-15': 'Kevin De Bruyne',
  'BEL-16': 'Jérémy Doku',
  'BEL-17': 'Charles De Ketelaere',
  'BEL-18': 'Leandro Trossard',
  'BEL-19': 'Loïs Openda',
  'BEL-20': 'Romelu Lukaku',
  'BIH-2': 'Nikola Vasilj',
  'BIH-3': 'Amer Dedic',
  'BIH-4': 'Sead Kolasinac',
  'BIH-5': 'Tarik Muharemovic',
  'BIH-6': 'Nihad Mujakic',
  'BIH-7': 'Nikola Katic',
  'BIH-8': 'Amir Hadziahmetovic',
  'BIH-9': 'Benjamin Tahirovic',
  'BIH-10': 'Armin Gigovic',
  'BIH-11': 'Ivan Sunjic',
  'BIH-12': 'Ivan Basic',
  'BIH-14': 'Dzenis Burnic',
  'BIH-15': 'Esmir Bajraktarevic',
  'BIH-16': 'Amar Memic',
  'BIH-17': 'Ermedin Demirovic',
  'BIH-18': 'Edin Dzeko',
  'BIH-19': 'Samed Bazdar',
  'BIH-20': 'Haris Tabakovic',
  'BRA-2': 'Alisson',
  'BRA-3': 'Bento',
  'BRA-4': 'Marquinhos',
  'BRA-5': 'Éder Militão',
  'BRA-6': 'Gabriel Magalhães',
  'BRA-7': 'Danilo',
  'BRA-8': 'Wesley',
  'BRA-9': 'Lucas Paquetá',
  'BRA-10': 'Casemiro',
  'BRA-11': 'Bruno Guimarães',
  'BRA-12': 'Luiz Henrique',
  'BRA-14': 'Vinicius Júnior',
  'BRA-15': 'Rodrygo',
  'BRA-16': 'João Pedro',
  'BRA-17': 'Matheus Cunha',
  'BRA-18': 'Gabriel Martinelli',
  'BRA-19': 'Raphinha',
  'BRA-20': 'Estévão',
  'CAN-2': 'Dayne St.Clair',
  'CAN-3': 'Alphonso Davies',
  'CAN-4': 'Alistair Johnston',
  'CAN-5': 'Samuel Adekugbe',
  'CAN-6': 'Riche Larvea',
  'CAN-7': 'Derek Cornelius',
  'CAN-8': 'Moïse Bombito',
  'CAN-9': 'Kamal Miller',
  'CAN-10': 'Stephen Eustáquio',
  'CAN-11': 'Ismaël Koné',
  'CAN-12': 'Jonathan Osorio',
  'CAN-14': 'Jacob Shaffelburg',
  'CAN-15': 'Mathieu Choinière',
  'CAN-16': 'Niko Sigur',
  'CAN-17': 'Tajon Buchanan',
  'CAN-18': 'Liam Millar',
  'CAN-19': 'Cyle Larin',
  'CAN-20': 'Jonathan David',
  'CIV-2': 'Yahia Fofana',
  'CIV-3': 'Ghislain Konan',
  'CIV-4': 'Wilfried Singo',
  'CIV-5': 'Odilon Kossounou',
  'CIV-6': 'Evan Ndicka',
  'CIV-7': 'Willy Boly',
  'CIV-8': 'Emmanuel Agbadou',
  'CIV-9': 'Ousmane Diomande',
  'CIV-10': 'Franck Kessie',
  'CIV-11': 'Seko Fofana',
  'CIV-12': 'Ibrahim Sangare',
  'CIV-14': 'Jean-Philippe Gbamin',
  'CIV-15': 'Amad Diallo',
  'CIV-16': 'Sébastien Haller',
  'CIV-17': 'Simon Adingra',
  'CIV-18': 'Yan Diomande',
  'CIV-19': 'Evann Guessand',
  'CIV-20': 'Oumar Diakite',
  'COD-2': 'Lionel Mpasi',
  'COD-3': 'Aaron Wan-Bissaka',
  'COD-4': 'Axel Tuanzebe',
  'COD-5': 'Arthur Masuaku',
  'COD-6': 'Chancel Mbemba',
  'COD-7': 'Joris Kayembe',
  'COD-8': 'Charles Pickel',
  'COD-9': 'Ngal\'ayel Mukau',
  'COD-10': 'Edo Kayembe',
  'COD-11': 'Samuel Moutoussamy',
  'COD-12': 'Noah Sadiki',
  'COD-14': 'Théo Bongonda',
  'COD-15': 'Meschak Elia',
  'COD-16': 'Yoane Wissa',
  'COD-17': 'Brian Cipenga',
  'COD-18': 'Fiston Mayele',
  'COD-19': 'Cédric Bakambu',
  'COD-20': 'Nathanaël Mbuku',
  'COL-2': 'Camilo Vargas',
  'COL-3': 'David Ospina',
  'COL-4': 'Dávinson Sánchez',
  'COL-5': 'Yerry Mina',
  'COL-6': 'Daniel Munoz',
  'COL-7': 'Johan Mojica',
  'COL-8': 'Jhon Lucumí',
  'COL-9': 'Santiago Arias',
  'COL-10': 'Jefferson Lerma',
  'COL-11': 'Kevin Castaño',
  'COL-12': 'Richard Rios',
  'COL-14': 'James Rodriguez',
  'COL-15': 'Juan Fernando Quintero',
  'COL-16': 'Jorge Carrascal',
  'COL-17': 'Jon Arias',
  'COL-18': 'Jhon Cordova',
  'COL-19': 'Luis Suarez',
  'COL-20': 'Luis Diaz',
  'CPV-2': 'Vozinha',
  'CPV-3': 'Logan Costa',
  'CPV-4': 'Pico',
  'CPV-5': 'Diney',
  'CPV-6': 'Steven Moreira',
  'CPV-7': 'Wagner Pina',
  'CPV-8': 'Joao Paulo',
  'CPV-9': 'Yannick Semedo',
  'CPV-10': 'Kevin Pina',
  'CPV-11': 'Patrick Andrade',
  'CPV-12': 'Jamiro Monteiro',
  'CPV-14': 'Deroy Duarte',
  'CPV-15': 'Garry Rodrigues',
  'CPV-16': 'Jovane Cabral',
  'CPV-17': 'Ryan Mendes',
  'CPV-18': 'Dailon Livramento',
  'CPV-19': 'Willy Semedo',
  'CPV-20': 'Bebe',
  'CRO-2': 'Dominik Livaković',
  'CRO-3': 'Duje Caleta-Car',
  'CRO-4': 'Josko Gvardiol',
  'CRO-5': 'Josip Stanišić',
  'CRO-6': 'Luka Vušković',
  'CRO-7': 'Josip Sutalo',
  'CRO-8': 'Kristijan Jakic',
  'CRO-9': 'Luka Modrić',
  'CRO-10': 'Mateo Kovacic',
  'CRO-11': 'Martin Baturina',
  'CRO-12': 'Lovro Majer',
  'CRO-14': 'Mario Pasalic',
  'CRO-15': 'Petar Sucic',
  'CRO-16': 'Ivan Perišić',
  'CRO-17': 'Marco Pasalic',
  'CRO-18': 'Ante Budimir',
  'CRO-19': 'Andrej Kramarić',
  'CRO-20': 'Franjo Ivanovic',
  'CUW-2': 'Eloy Room',
  'CUW-3': 'Armando Obispo',
  'CUW-4': 'Sherel Floranus',
  'CUW-5': 'Jurien Gaari',
  'CUW-6': 'Joshua Brenet',
  'CUW-7': 'Roshon Van Eijma',
  'CUW-8': 'Shurandy Sambo',
  'CUW-9': 'Livano Comenencia',
  'CUW-10': 'Godfried Roemeratoe',
  'CUW-11': 'Juninho Bacuna',
  'CUW-12': 'Leandro Bacuna',
  'CUW-14': 'Tahith Chong',
  'CUW-15': 'Kenji Gorre',
  'CUW-16': 'Jearl Margaritha',
  'CUW-17': 'Jurgen Locadia',
  'CUW-18': 'Jeremy Antonisse',
  'CUW-19': 'Gervane Kastaneer',
  'CUW-20': 'Sontje Hansen',
  'CZE-2': 'Matej Kovar',
  'CZE-3': 'Jindrich Stanek',
  'CZE-4': 'Ladislav Krejci',
  'CZE-5': 'Vladimir Coufal',
  'CZE-6': 'Jaroslav Zeleny',
  'CZE-7': 'Tomas Holes',
  'CZE-8': 'David Zima',
  'CZE-9': 'Michal Sadilek',
  'CZE-10': 'Lukas Provod',
  'CZE-11': 'Lukas Cerv',
  'CZE-12': 'Tomas Soucek',
  'CZE-14': 'Pavel Sulc',
  'CZE-15': 'Matej Vydra',
  'CZE-16': 'Vasil Kusej',
  'CZE-17': 'Tomas Chory',
  'CZE-18': 'Vaclav Cerny',
  'CZE-19': 'Adam Hlozek',
  'CZE-20': 'Patrik Schick',
  'ECU-2': 'Hernán Galíndez',
  'ECU-3': 'Gonzalo Valle',
  'ECU-4': 'Piero Hincapié',
  'ECU-5': 'Pervis Estupiñán',
  'ECU-6': 'Willian Pacho',
  'ECU-7': 'Ángelo Preciado',
  'ECU-8': 'Joel Ordóñez',
  'ECU-9': 'Moises Caicedo',
  'ECU-10': 'Alan Franco',
  'ECU-11': 'Kendry Paez',
  'ECU-12': 'Pedro Vite',
  'ECU-14': 'John Veboah',
  'ECU-15': 'Leonardo Campana',
  'ECU-16': 'Gonzalo Plata',
  'ECU-17': 'Nilson Angulo',
  'ECU-18': 'Alan Minda',
  'ECU-19': 'Kevin Rodriguez',
  'ECU-20': 'Enner Valencia',
  'EGY-2': 'Mohamed El Shenawy',
  'EGY-3': 'Mohamed Hany',
  'EGY-4': 'Mohamed Hamdy',
  'EGY-5': 'Yasser Ibrahim',
  'EGY-6': 'Khaled Sobhi',
  'EGY-7': 'Ramy Rabia',
  'EGY-8': 'Hossam Abdelmaguid',
  'EGY-9': 'Ahmed Fatouh',
  'EGY-10': 'Marwan Attia',
  'EGY-11': 'Zizo',
  'EGY-12': 'Hamdy Fathy',
  'EGY-14': 'Mohamed Lasheen',
  'EGY-15': 'Emam Ashour',
  'EGY-16': 'Osama Faisal',
  'EGY-17': 'Mohamed Salah',
  'EGY-18': 'Mostafa Mohamed',
  'EGY-19': 'Trezeguet',
  'EGY-20': 'Omar Marmoush',
  'ENG-2': 'Jordan Pickford',
  'ENG-3': 'John Stones',
  'ENG-4': 'Marc Guéhi',
  'ENG-5': 'Ezri Konsa',
  'ENG-6': 'Trent Alexander-Arnold',
  'ENG-7': 'Reece James',
  'ENG-8': 'Dan Burn',
  'ENG-9': 'Jordan Henderson',
  'ENG-10': 'Declan Rice',
  'ENG-11': 'Jude Bellingham',
  'ENG-12': 'Cole Palmer',
  'ENG-14': 'Morgan Rogers',
  'ENG-15': 'Anthony Gordon',
  'ENG-16': 'Phil Foden',
  'ENG-17': 'Bukayo Saka',
  'ENG-18': 'Harry Kane',
  'ENG-19': 'Marcus Rashford',
  'ENG-20': 'Ollie Watkins',
  'ESP-2': 'Unai Simon',
  'ESP-3': 'Robin Le Normand',
  'ESP-4': 'Aymeric Laporte',
  'ESP-5': 'Dean Huijsen',
  'ESP-6': 'Pedro Porro',
  'ESP-7': 'Dani Carvajal',
  'ESP-8': 'Marc Cucurella',
  'ESP-9': 'Martín Zubimendi',
  'ESP-10': 'Rodri',
  'ESP-11': 'Pedri',
  'ESP-12': 'Fabian Ruiz',
  'ESP-14': 'Mikel Merino',
  'ESP-15': 'Lamine Yamal',
  'ESP-16': 'Dani Olmo',
  'ESP-17': 'Nico Williams',
  'ESP-18': 'Ferran Torres',
  'ESP-19': 'Álvaro Morata',
  'ESP-20': 'Mikel Oyarzabal',
  'FRA-2': 'Mike Maignan',
  'FRA-3': 'Theo Hernandez',
  'FRA-4': 'William Saliba',
  'FRA-5': 'Jules Kounde',
  'FRA-6': 'Ibrahima Konate',
  'FRA-7': 'Dayot Upamecano',
  'FRA-8': 'Lucas Digne',
  'FRA-9': 'Aurélien Tchouaméni',
  'FRA-10': 'Eduardo Camavinga',
  'FRA-11': 'Manu Kone',
  'FRA-12': 'Adrien Rabiot',
  'FRA-14': 'Michael Olise',
  'FRA-15': 'Ousmane Dembele',
  'FRA-16': 'Bradley Barcola',
  'FRA-17': 'Désiré Doué',
  'FRA-18': 'Kingsley Coman',
  'FRA-19': 'Hugo Ekitike',
  'FRA-20': 'Kylian Mbappe',
  'GER-2': 'Marc-André ter Stegen',
  'GER-3': 'Jonathan Tah',
  'GER-4': 'David Raum',
  'GER-5': 'Nico Schlotterbeck',
  'GER-6': 'Antonio Rüdiger',
  'GER-7': 'Waldemar Anton',
  'GER-8': 'Ridle Baku',
  'GER-9': 'Maximilian Mittelstadt',
  'GER-10': 'Joshua Kimmich',
  'GER-11': 'Florian Wirtz',
  'GER-12': 'Felix Nmecha',
  'GER-14': 'Leon Goretzka',
  'GER-15': 'Jamal Musiala',
  'GER-16': 'Serge Gnabry',
  'GER-17': 'Kai Havertz',
  'GER-18': 'Leroy Sane',
  'GER-19': 'Karim Adeyemi',
  'GER-20': 'Nick Woltemade',
  'GHA-2': 'Lawrence Ati Zigi',
  'GHA-3': 'Tariq Lamptey',
  'GHA-4': 'Mohammed Salisu',
  'GHA-5': 'Alidu Seidu',
  'GHA-6': 'Alexander Djiku',
  'GHA-7': 'Gideon Mensah',
  'GHA-8': 'Caleb Yirenkyi',
  'GHA-9': 'Abdul Issahaku Fatawu',
  'GHA-10': 'Thomas Partey',
  'GHA-11': 'Salis Abdul Samed',
  'GHA-12': 'Kamaldeen Sulemana',
  'GHA-14': 'Mohammed Kudus',
  'GHA-15': 'Inaki Williams',
  'GHA-16': 'Jordan Ayew',
  'GHA-17': 'Andrew Ayew',
  'GHA-18': 'Joseph Paintsil',
  'GHA-19': 'Osman Bukari',
  'GHA-20': 'Antoine Semenyo',
  'HAI-2': 'Johny Placide',
  'HAI-3': 'Carlens Arcus',
  'HAI-4': 'Martin Expérience',
  'HAI-5': 'Jean-Kevin Duverne',
  'HAI-6': 'Ricardo Adé',
  'HAI-7': 'Duke Lacroix',
  'HAI-8': 'Garven Metusala',
  'HAI-9': 'Hannes Delcroix',
  'HAI-10': 'Leverton Pierre',
  'HAI-11': 'Danley Jean Jacques',
  'HAI-12': 'Jean-Ricner Bellegarde',
  'HAI-14': 'Christopher Attys',
  'HAI-15': 'Derrick Etienne Jr',
  'HAI-16': 'Josue Casimir',
  'HAI-17': 'Ruben Providence',
  'HAI-18': 'Duckens Nazon',
  'HAI-19': 'Louicius Deedson',
  'HAI-20': 'Frantzdy Pierrot',
  'IRN-2': 'Alireza Beiranvand',
  'IRN-3': 'Morteza Pouraliganji',
  'IRN-4': 'Ehsan Hajsafi',
  'IRN-5': 'Milad Mohammadi',
  'IRN-6': 'Shojae Khalilzadeh',
  'IRN-7': 'Ramin Rezaeian',
  'IRN-8': 'Hossein Kanaani',
  'IRN-9': 'Sadegh Moharrami',
  'IRN-10': 'Saleh Hardani',
  'IRN-11': 'Saeed Ezatolahi',
  'IRN-12': 'Saman Ghoddos',
  'IRN-14': 'Omid Noorafkan',
  'IRN-15': 'Roozbeh Cheshmi',
  'IRN-16': 'Mohammad Mohebi',
  'IRN-17': 'Sardar Azmoun',
  'IRN-18': 'Mehdi Taremi',
  'IRN-19': 'Alireza Jahanbakhsh',
  'IRN-20': 'Ali Gholizadeh',
  'IRQ-2': 'Jalal Hassan',
  'IRQ-3': 'Rebin Sulaka',
  'IRQ-4': 'Hussein Ali',
  'IRQ-5': 'Akam Hashem',
  'IRQ-6': 'Merchas Doski',
  'IRQ-7': 'Zaid Tahseen',
  'IRQ-8': 'Manaf Younis',
  'IRQ-9': 'Zidane Iqbal',
  'IRQ-10': 'Amir Al-Ammari',
  'IRQ-11': 'Ibrahim Bavesh',
  'IRQ-12': 'Ali Jasim',
  'IRQ-14': 'Youssef Amyn',
  'IRQ-15': 'Aimar Sher',
  'IRQ-16': 'Marko Farji',
  'IRQ-17': 'Osama Rashid',
  'IRQ-18': 'Ali Al-Hamadi',
  'IRQ-19': 'Aymen Hussein',
  'IRQ-20': 'Mohanad Ali',
  'JOR-2': 'Yazeed Abulaila',
  'JOR-3': 'Ihsan Haddad',
  'JOR-4': 'Mohammad Abu Hashish',
  'JOR-5': 'Yazan Al-Arab',
  'JOR-6': 'Abdallah Nasib',
  'JOR-7': 'Saleem Obaid',
  'JOR-8': 'Mohammad Abualnadi',
  'JOR-9': 'Ibrahim Saadeh',
  'JOR-10': 'Nizar Al-Rashdan',
  'JOR-11': 'Noor Al-Rawabdeh',
  'JOR-12': 'Mohannad Abu Taha',
  'JOR-14': 'Amer Jamous',
  'JOR-15': 'Musa Al-Taamari',
  'JOR-16': 'Yazan Al-Naimat',
  'JOR-17': 'Mahmoud Al-Mardi',
  'JOR-18': 'Ali Olwan',
  'JOR-19': 'Mohammad Abu Zrayq',
  'JOR-20': 'Ibrahim Sabra',
  'JPN-2': 'Zion Suzuki',
  'JPN-3': 'Henry Heroki Mochizuki',
  'JPN-4': 'Ayumu Seko',
  'JPN-5': 'Junnosuke Suzuki',
  'JPN-6': 'Shogo Taniguchi',
  'JPN-7': 'Tsuyoshi Watanabe',
  'JPN-8': 'Kaishu Sano',
  'JPN-9': 'Yuki Soma',
  'JPN-10': 'Ao Tanaka',
  'JPN-11': 'Daichi Kamada',
  'JPN-12': 'Takefusa Kubo',
  'JPN-14': 'Ritsu Doan',
  'JPN-15': 'Keito Nakamura',
  'JPN-16': 'Takumi Minamino',
  'JPN-17': 'Shuto Machino',
  'JPN-18': 'Junya Ito',
  'JPN-19': 'Koki Ogawa',
  'JPN-20': 'Ayase Ueda',
  'KOR-2': 'Hyeon-woo Jo',
  'KOR-3': 'Seung-Gyu Kim',
  'KOR-4': 'Min-jae Kim',
  'KOR-5': 'Yu-min Cho',
  'KOR-6': 'Young-woo Seol',
  'KOR-7': 'Han-beom Lee',
  'KOR-8': 'Tae-seok Lee',
  'KOR-9': 'Myung-jae Lee',
  'KOR-10': 'Jae-sung Lee',
  'KOR-11': 'In-beom Hwang',
  'KOR-12': 'Kang-in Lee',
  'KOR-14': 'Seung-ho Paik',
  'KOR-15': 'Jens Castrop',
  'KOR-16': 'Dongg-yeong Lee',
  'KOR-17': 'Gue-sung Cho',
  'KOR-18': 'Heung-min Son',
  'KOR-19': 'Hee-chan Hwang',
  'KOR-20': 'Hyeon-Gyu Oh',
  'KSA-2': 'Nawaf Alaqidi',
  'KSA-3': 'Abdulrahman Al-Sanbi',
  'KSA-4': 'Saud Abdulhamid',
  'KSA-5': 'Nawaf Bouwashl',
  'KSA-6': 'Jihad Thakri',
  'KSA-7': 'Moteb Al-Harbi',
  'KSA-8': 'Hassan Altambakti',
  'KSA-9': 'Musab Aljuwayr',
  'KSA-10': 'Ziyad Aljohani',
  'KSA-11': 'Abdullah Alkhaibari',
  'KSA-12': 'Nasser Aldawsari',
  'KSA-14': 'Saleh Abu Alshamat',
  'KSA-15': 'Marwan Alsahafi',
  'KSA-16': 'Salem Aldawsari',
  'KSA-17': 'Abdulrahman Al-Aboud',
  'KSA-18': 'Feras Akbrikan',
  'KSA-19': 'Saleh Alshehri',
  'KSA-20': 'Abdullah Al-Hamdan',
  'MAR-2': 'Yassine Bounou',
  'MAR-3': 'Munir El Kajoui',
  'MAR-4': 'Achraf Hakimi',
  'MAR-5': 'Noussair Mazraoui',
  'MAR-6': 'Nayef Aguerd',
  'MAR-7': 'Roman Saiss',
  'MAR-8': 'Jawad El Yamio',
  'MAR-9': 'Adam Masina',
  'MAR-10': 'Sofyan Amrabat',
  'MAR-11': 'Azzedine Ounahi',
  'MAR-12': 'Eliesse Ben Seghir',
  'MAR-14': 'Bilal El Khannouss',
  'MAR-15': 'Ismael Saibari',
  'MAR-16': 'Youssef En-Nesyri',
  'MAR-17': 'Abde Ezzalzouli',
  'MAR-18': 'Soufiane Rahimi',
  'MAR-19': 'Brahim Diaz',
  'MAR-20': 'Ayoub El Kaabi',
  'MEX-2': 'Luis Malagón',
  'MEX-3': 'Johan Vasquez',
  'MEX-4': 'Jorge Sánchez',
  'MEX-5': 'Cesar Montes',
  'MEX-6': 'Jesus Gallardo',
  'MEX-7': 'Israel Reyes',
  'MEX-8': 'Diego Lainez',
  'MEX-9': 'Carlos Rodriguez',
  'MEX-10': 'Edson Alvarez',
  'MEX-11': 'Orbelin Pineda',
  'MEX-12': 'Marcel Ruiz',
  'MEX-14': 'Érick Sánchez',
  'MEX-15': 'Hirving Lozano',
  'MEX-16': 'Santiago Giménez',
  'MEX-17': 'Raúl Jiménez',
  'MEX-18': 'Alexis Vega',
  'MEX-19': 'Roberto Alvarado',
  'MEX-20': 'Cesar Huerta',
  'NED-2': 'Bart Verbruggen',
  'NED-3': 'Virgil van Dijk',
  'NED-4': 'Micky van de Ven',
  'NED-5': 'Jurrien Timber',
  'NED-6': 'Denzel Dumfries',
  'NED-7': 'Nathan Aké',
  'NED-8': 'Jeremie Frimpong',
  'NED-9': 'Jan Paul van Hecke',
  'NED-10': 'Tijjani Reijnders',
  'NED-11': 'Ryan Gravenberch',
  'NED-12': 'Teun Koopmeiners',
  'NED-14': 'Frenkie de Jong',
  'NED-15': 'Xavi Simons',
  'NED-16': 'Justin Kluivert',
  'NED-17': 'Memphis Depay',
  'NED-18': 'Donyell Malen',
  'NED-19': 'Wout Weghorst',
  'NED-20': 'Cody Gakpo',
  'NOR-2': 'Orjan Nyland',
  'NOR-3': 'Julian Ryerson',
  'NOR-4': 'Leo Ostigård',
  'NOR-5': 'Kristoffer Vassbakk Ajer',
  'NOR-6': 'Marcus Holmgren Pedersen',
  'NOR-7': 'David Møller Wolfe',
  'NOR-8': 'Torbjørn Heggem',
  'NOR-9': 'Morten Thorsby',
  'NOR-10': 'Martin Ødegaard',
  'NOR-11': 'Sander Berge',
  'NOR-12': 'Andreas Schjelderup',
  'NOR-14': 'Patrick Berg',
  'NOR-15': 'Erling Haaland',
  'NOR-16': 'Alexander Sørloth',
  'NOR-17': 'Aron Dønnum',
  'NOR-18': 'Jorgen Strand Larsen',
  'NOR-19': 'Antonio Nusa',
  'NOR-20': 'Oscar Bobb',
  'NZL-2': 'Max Crocombe Payne',
  'NZL-3': 'Alex Paulsen',
  'NZL-4': 'Michael Boxall',
  'NZL-5': 'Liberato Cacace',
  'NZL-6': 'Tim Payne',
  'NZL-7': 'Tyler Bindon',
  'NZL-8': 'Francis de Vries',
  'NZL-9': 'Finn Surman',
  'NZL-10': 'Joe Bell',
  'NZL-11': 'Sarpreet Singh',
  'NZL-12': 'Ryan Thomas',
  'NZL-14': 'Matthew Garbett',
  'NZL-15': 'Marko Stamenić',
  'NZL-16': 'Ben Old',
  'NZL-17': 'Chris Wood',
  'NZL-18': 'Elijah Just',
  'NZL-19': 'Callum McCowatt',
  'NZL-20': 'Kosta Barbarouses',
  'PAN-2': 'Orlando Mosquera',
  'PAN-3': 'Luis Mejia',
  'PAN-4': 'Fidel Escobar',
  'PAN-5': 'Andres Andrade',
  'PAN-6': 'Michael Amir Murillo',
  'PAN-7': 'Eric Davis',
  'PAN-8': 'Jose Cordoba',
  'PAN-9': 'Cesar Blackman',
  'PAN-10': 'Cristian Martinez',
  'PAN-11': 'Aníbal Godoy',
  'PAN-12': 'Adalberto Carrasquilla',
  'PAN-14': 'Édgar Bárcenas',
  'PAN-15': 'Carlos Harvey',
  'PAN-16': 'Ismael Díaz',
  'PAN-17': 'Jose Fajardo',
  'PAN-18': 'Cecilio Waterman',
  'PAN-19': 'Jose Luiz Rodriguez',
  'PAN-20': 'Alberto Quintero',
  'PAR-2': 'Roberto Fernandez',
  'PAR-3': 'Orlando Gill',
  'PAR-4': 'Gustavo Gomez',
  'PAR-5': 'Fabián Balbuena',
  'PAR-6': 'Juan José Cáceres',
  'PAR-7': 'Omar Alderete',
  'PAR-8': 'Junior Alonso',
  'PAR-9': 'Mathías Villasanti',
  'PAR-10': 'Diego Gomez',
  'PAR-11': 'Damián Bobadilla',
  'PAR-12': 'Andres Cubas',
  'PAR-14': 'Matias Galarza Fonda',
  'PAR-15': 'Julio Enciso',
  'PAR-16': 'Alejandro Romero Gamarra',
  'PAR-17': 'Miguel Almirón',
  'PAR-18': 'Ramon Sosa',
  'PAR-19': 'Angel Romero',
  'PAR-20': 'Antonio Sanabria',
  'POR-2': 'Diogo Costa',
  'POR-3': 'Jose Sa',
  'POR-4': 'Ruben Dias',
  'POR-5': 'João Cancelo',
  'POR-6': 'Diogo Dalot',
  'POR-7': 'Nuno Mendes',
  'POR-8': 'Gonçalo Inácio',
  'POR-9': 'Bernardo Silva',
  'POR-10': 'Bruno Fernandes',
  'POR-11': 'Ruben Neves',
  'POR-12': 'Vitinha',
  'POR-14': 'João Neves',
  'POR-15': 'Cristiano Ronaldo',
  'POR-16': 'Francisco Trincao',
  'POR-17': 'João Felix',
  'POR-18': 'Gonçalo Ramos',
  'POR-19': 'Pedro Neto',
  'POR-20': 'Rafael Leão',
  'QAT-2': 'Meshaal Barsham',
  'QAT-3': 'Sultan Albrake',
  'QAT-4': 'Lucas Mendes',
  'QAT-5': 'Homam Ahmed',
  'QAT-6': 'Boualem Khoukhi',
  'QAT-7': 'Pedro Miguel',
  'QAT-8': 'Tarek Salman',
  'QAT-9': 'Mohamed Al-Mannai',
  'QAT-10': 'Karim Boudiaf',
  'QAT-11': 'Assim Madibo',
  'QAT-12': 'Ahmed Fatehi',
  'QAT-14': 'Mohammed Waad',
  'QAT-15': 'Abdulaziz Hatem',
  'QAT-16': 'Hassan Al-Haydos',
  'QAT-17': 'Edmilson Junior',
  'QAT-18': 'Akram Hassan Afif',
  'QAT-19': 'Ahmed Al Ganehi',
  'QAT-20': 'Almoez Ali',
  'RSA-2': 'Ronwen Williams',
  'RSA-3': 'Sipho Chaine',
  'RSA-4': 'Aubrey Modiba',
  'RSA-5': 'Samukele Kabini',
  'RSA-6': 'Mbekezeli Mbokazi',
  'RSA-7': 'Khulumani Ndamane',
  'RSA-8': 'Siyabonga Ngezana',
  'RSA-9': 'Khuliso Mudau',
  'RSA-10': 'Nkosinathi Sibisi',
  'RSA-11': 'Teboho Mokoena',
  'RSA-12': 'Thalente Mbatha',
  'RSA-14': 'Bathasi Aubaas',
  'RSA-15': 'Yaya Sithole',
  'RSA-16': 'Sipho Mbule',
  'RSA-17': 'Lyle Foster',
  'RSA-18': 'Iqraam Rayners',
  'RSA-19': 'Mohau Nkota',
  'RSA-20': 'Oswin Appollis',
  'SCO-2': 'Angus Gunn',
  'SCO-3': 'Jack Hendry',
  'SCO-4': 'Kieran Tierney',
  'SCO-5': 'Aaron Hickey',
  'SCO-6': 'Andrew Robertson',
  'SCO-7': 'Scott McKenna',
  'SCO-8': 'John Souttar',
  'SCO-9': 'Anthony Ralston',
  'SCO-10': 'Grant Hanley',
  'SCO-11': 'Scott McTominay',
  'SCO-12': 'Billy Gilmour',
  'SCO-14': 'Lewis Ferguson',
  'SCO-15': 'Ryan Christie',
  'SCO-16': 'Kenny McLean',
  'SCO-17': 'John McGinn',
  'SCO-18': 'Lyndon Dykes',
  'SCO-19': 'Che Adams',
  'SCO-20': 'Ben Gannon-Doak',
  'SEN-2': 'Edouard Mendy',
  'SEN-3': 'Yehvann Diouf',
  'SEN-4': 'Moussa Niakhaté',
  'SEN-5': 'Abdoulaye Seck',
  'SEN-6': 'Ismail Jakobs',
  'SEN-7': 'El Hadji Malick Diouf',
  'SEN-8': 'Kalidou Koulibaly',
  'SEN-9': 'Idrissa Gana Gueye',
  'SEN-10': 'Pape Matar Sarr',
  'SEN-11': 'Pape Gueye',
  'SEN-12': 'Habib Diarra',
  'SEN-14': 'Lamine Camara',
  'SEN-15': 'Sadio Mane',
  'SEN-16': 'Ismaïla Sarr',
  'SEN-17': 'Boulaye Dia',
  'SEN-18': 'Iliman Ndiaye',
  'SEN-19': 'Nicolas Jackson',
  'SEN-20': 'Krepin Diatta',
  'SUI-2': 'Gregor Kobel',
  'SUI-3': 'Yvon Mvogo',
  'SUI-4': 'Manuel Akanji',
  'SUI-5': 'Ricardo Rodriguez',
  'SUI-6': 'Nico Elvedi',
  'SUI-7': 'Aurèle Amenda',
  'SUI-8': 'Silvan Widmer',
  'SUI-9': 'Granit Xhaka',
  'SUI-10': 'Denis Zakaria',
  'SUI-11': 'Remo Freuler',
  'SUI-12': 'Fabian Rieder',
  'SUI-14': 'Ardon Jashari',
  'SUI-15': 'Johan Manzambi',
  'SUI-16': 'Michel Aebischer',
  'SUI-17': 'Breel Embolo',
  'SUI-18': 'Ruben Vargas',
  'SUI-19': 'Dan Ndoye',
  'SUI-20': 'Zeki Amdouni',
  'SWE-2': 'Victor Johansson',
  'SWE-3': 'Isak Hien',
  'SWE-4': 'Gabriel Gudmundsson',
  'SWE-5': 'Emil Holm',
  'SWE-6': 'Victor Nilsson Lindelöf',
  'SWE-7': 'Gustaf Lagerbielke',
  'SWE-8': 'Lucas Bergvall',
  'SWE-9': 'Hugo Larsson',
  'SWE-10': 'Jesper Karlström',
  'SWE-11': 'Yasin Ayari',
  'SWE-12': 'Mattias Svanberg',
  'SWE-14': 'Daniel Svensson',
  'SWE-15': 'Ken Sema',
  'SWE-16': 'Roony Bardghji',
  'SWE-17': 'Dejan Kulusevski',
  'SWE-18': 'Anthony Elanga',
  'SWE-19': 'Alexander Isak',
  'SWE-20': 'Viktor Gyökeres',
  'TUN-2': 'Bechir Ben Said',
  'TUN-3': 'Aymen Dahmen',
  'TUN-4': 'Yan Valery',
  'TUN-5': 'Montassar Talbi',
  'TUN-6': 'Yassine Meriah',
  'TUN-7': 'Ali Abdi',
  'TUN-8': 'Dylan Bronn',
  'TUN-9': 'Ellyes Skhiri',
  'TUN-10': 'Aissa Laidouni',
  'TUN-11': 'Ferjani Sassi',
  'TUN-12': 'Mohamed Ali Ben Romdhane',
  'TUN-14': 'Hannibal Mejbri',
  'TUN-15': 'Elias Achouri',
  'TUN-16': 'Elias Saad',
  'TUN-17': 'Hazem Mastouri',
  'TUN-18': 'Ismael Gharbi',
  'TUN-19': 'Sayfallah Ltaief',
  'TUN-20': 'Naim Sliti',
  'TUR-2': 'Ugurcan Cakir',
  'TUR-3': 'Mert Muldur',
  'TUR-4': 'Zeki Celik',
  'TUR-5': 'Abdulkerim Bardakci',
  'TUR-6': 'Caglar Soyuncu',
  'TUR-7': 'Merih Demiral',
  'TUR-8': 'Ferdi Kadioglu',
  'TUR-9': 'Kaan Ayhan',
  'TUR-10': 'Ismail Yuksek',
  'TUR-11': 'Hakan Calhanoglu',
  'TUR-12': 'Orkun Kokcu',
  'TUR-14': 'Arda Guler',
  'TUR-15': 'Irfan Can Kahveci',
  'TUR-16': 'Yunus Akgun',
  'TUR-17': 'Can Uzun',
  'TUR-18': 'Baris Alper Yilmaz',
  'TUR-19': 'Kerem Akturkoglu',
  'TUR-20': 'Kenan Yildiz',
  'URU-2': 'Sergio Rochet',
  'URU-3': 'Santiago Mele',
  'URU-4': 'Ronald Araujo',
  'URU-5': 'José María Giménez',
  'URU-6': 'Sebastian Caceres',
  'URU-7': 'Mathias Olivera',
  'URU-8': 'Guillermo Varela',
  'URU-9': 'Nahitan Nandez',
  'URU-10': 'Federico Valverde',
  'URU-11': 'Giorgian De Arrascaeta',
  'URU-12': 'Rodrigo Bentancur',
  'URU-14': 'Manuel Ugarte',
  'URU-15': 'Nicolás de la Cruz',
  'URU-16': 'Maxi Araujo',
  'URU-17': 'Darwin Núñez',
  'URU-18': 'Federico Viñas',
  'URU-19': 'Rodrigo Aguirre',
  'URU-20': 'Facundo Pellistri',
  'USA-2': 'Math Freese',
  'USA-3': 'Chris Richards',
  'USA-4': 'Tim Ream',
  'USA-5': 'Mark McKenzie',
  'USA-6': 'Alex Freeman',
  'USA-7': 'Antonee Robinson',
  'USA-8': 'Tyler Adams',
  'USA-9': 'Tanner Tessmann',
  'USA-10': 'Weston McKenny',
  'USA-11': 'Christian Roldan',
  'USA-12': 'Timothy Weah',
  'USA-14': 'Diego Luna',
  'USA-15': 'Malik Tillman',
  'USA-16': 'Christian Pulisic',
  'USA-17': 'Brenden Aaronson',
  'USA-18': 'Ricardo Pepi',
  'USA-19': 'Haji Wright',
  'USA-20': 'Folarin Balogun',
  'UZB-2': 'Utkir Yusupov',
  'UZB-3': 'Farrukh Savfiev',
  'UZB-4': 'Sherzod Nasrullaev',
  'UZB-5': 'Umar Eshmurodov',
  'UZB-6': 'Husniddin Aliqulov',
  'UZB-7': 'Rustamjon Ashurmatov',
  'UZB-8': 'Khojiakbar Alijonov',
  'UZB-9': 'Abdukodir Khusanov',
  'UZB-10': 'Odiljon Hamrobekov',
  'UZB-11': 'Otabek Shukurov',
  'UZB-12': 'Jamshid Iskanderov',
  'UZB-14': 'Azizbek Turgunboev',
  'UZB-15': 'Khojimat Erkinov',
  'UZB-16': 'Eldor Shomurodov',
  'UZB-17': 'Oston Urunov',
  'UZB-18': 'Jaloliddin Masharipov',
  'UZB-19': 'Igor Sergeev',
  'UZB-20': 'Abbosbek Fayzullaev',
};



const INTRO_INFO = [
  { label: 'Logo Panini',        code: 'PANINI',   accent: '#0F0F12', flag: '' },
  { label: 'Emblema oficial',    code: 'FIFA 26',  accent: '#E11D48', flag: '' },
  { label: 'Emblema · variante', code: 'FIFA 26',  accent: '#9333EA', flag: '' },
  { label: 'Mascotas oficiales', code: 'MASCOTAS', accent: '#0EA5E9', flag: '' },
  { label: 'Eslogan oficial',    code: 'ESLOGAN',  accent: '#F59E0B', flag: '' },
  { label: 'Pelota oficial',     code: 'PELOTA',   accent: '#10B981', flag: '⚽' },
  { label: 'Sedes · Canadá',     code: 'CAN',      accent: '#D52B1E', flag: '🇨🇦' },
  { label: 'Sedes · México',     code: 'MEX',      accent: '#006847', flag: '🇲🇽' },
  { label: 'Sedes · EE.UU.',     code: 'USA',      accent: '#1B2C5C', flag: '🇺🇸' },
];

const MUSEUM_INFO = [
  { label: 'Italia 1934',       code: '1934', accent: '#0066CC', flag: '🇮🇹' },
  { label: 'Uruguay 1950',      code: '1950', accent: '#0038A8', flag: '🇺🇾' },
  { label: 'Alemania F. 1954',  code: '1954', accent: '#1A1A1A', flag: '🇩🇪' },
  { label: 'Brasil 1962',       code: '1962', accent: '#FFCC29', flag: '🇧🇷' },
  { label: 'Alemania F. 1974',  code: '1974', accent: '#1A1A1A', flag: '🇩🇪' },
  { label: 'Argentina 1986',    code: '1986', accent: '#74ACDF', flag: '🇦🇷' },
  { label: 'Brasil 1994',       code: '1994', accent: '#FFCC29', flag: '🇧🇷' },
  { label: 'Brasil 2002',       code: '2002', accent: '#FFCC29', flag: '🇧🇷' },
  { label: 'Italia 2006',       code: '2006', accent: '#0066CC', flag: '🇮🇹' },
  { label: 'Alemania 2014',     code: '2014', accent: '#1A1A1A', flag: '🇩🇪' },
  { label: 'Argentina 2022',    code: '2022', accent: '#74ACDF', flag: '🇦🇷' },
];

const COCA_INFO = [
  { label: 'Lamine Yamal',      code: 'ESP', accent: '#AA151B', flag: '🇪🇸' },
  { label: 'Joshua Kimmich',    code: 'GER', accent: '#1A1A1A', flag: '🇩🇪' },
  { label: 'Harry Kane',        code: 'ENG', accent: '#CE1124', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { label: 'Santiago Giménez',  code: 'MEX', accent: '#006847', flag: '🇲🇽' },
  { label: 'Antonee Robinson',  code: 'USA', accent: '#1B2C5C', flag: '🇺🇸' },
  { label: 'Jefferson Lerma',   code: 'COL', accent: '#FCD116', flag: '🇨🇴' },
  { label: 'Edson Álvarez',     code: 'MEX', accent: '#006847', flag: '🇲🇽' },
  { label: 'Virgil van Dijk',   code: 'NED', accent: '#FF6900', flag: '🇳🇱' },
  { label: 'Alphonso Davies',   code: 'CAN', accent: '#D52B1E', flag: '🇨🇦' },
  { label: 'Weston McKennie',   code: 'USA', accent: '#1B2C5C', flag: '🇺🇸' },
  { label: 'Lautaro Martínez',  code: 'ARG', accent: '#74ACDF', flag: '🇦🇷' },
  { label: 'Gabriel Magalhães', code: 'BRA', accent: '#FFCC29', flag: '🇧🇷' },
];

const STICKERS_PER_TEAM = 20;
const INTRO_COUNT = 9;
const MUSEUM_COUNT = 11;
const COCA_COUNT = 12;
const TOTAL_BASE = INTRO_COUNT + MUSEUM_COUNT + 48 * STICKERS_PER_TEAM; // 980

const STORAGE_KEY = 'panini26-counts-v2';
const NAMES_KEY = 'panini26-names-v2';

// Lookup all teams flat
const ALL_TEAMS = GROUPS.flatMap(g => TEAMS_BY_GROUP[g].map(t => ({ ...t, group: g })));
const TEAM_BY_CODE = Object.fromEntries(ALL_TEAMS.map(t => [t.code, t]));

// =========================
// ALBUM PAGE ORDER (for prev/next page navigation)
// =========================
const ALL_PAGES = [
  { type: 'simple', section: 'INTRO', label: 'Introducción', subtitle: 'Álbum · pág. 1' },
  ...ALL_TEAMS.map((t, i) => ({
    type: 'team',
    code: t.code,
    label: t.name,
    subtitle: `Grupo ${t.group}`,
  })),
  { type: 'simple', section: 'MUSEUM', label: 'Museo FIFA', subtitle: 'Campeones' },
  { type: 'simple', section: 'COCA',   label: 'Extras Coca-Cola', subtitle: 'Bonus' },
];

function pageIndexOf(view) {
  if (!view) return -1;
  if (view.type === 'simple') return ALL_PAGES.findIndex(p => p.type === 'simple' && p.section === view.section);
  if (view.type === 'team') return ALL_PAGES.findIndex(p => p.type === 'team' && p.code === view.code);
  return -1;
}

function pageNeighbor(view, delta) {
  const i = pageIndexOf(view);
  if (i < 0) return null;
  const n = ALL_PAGES.length;
  const next = ((i + delta) % n + n) % n;
  return ALL_PAGES[next];
}

function viewFromPage(p) {
  return p.type === 'team'
    ? { type: 'team', code: p.code }
    : { type: 'simple', section: p.section };
}


// Luminance helper: light backgrounds (yellow teams etc.) need dark text
function isLightColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55;
}
function textOn(hex) {
  return isLightColor(hex) ? '#0F0F12' : '#FFFFFF';
}

// =========================
// HELPERS
// =========================
function stickerLabel(idx) {
  // For sections that don't have team-photo positions (INTRO/MUSEUM/COCA)
  return `#${String(idx).padStart(2, '0')}`;
}

// Resolve a player's display name: user override → official Panini default → empty
function resolveName(id, namesMap) {
  return (namesMap && namesMap[id]) || DEFAULT_NAMES[id] || '';
}


// =========================
// SEARCH / REPES HELPERS
// =========================
function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function allStickers(counts, names) {
  const out = [];
  // Introducción
  INTRO_INFO.forEach((info, i) => {
    const id = `INTRO-${i + 1}`;
    out.push({
      id,
      key: 'intro',
      sectionTitle: 'Introducción',
      sectionSort: 0,
      number: i + 1,
      label: info.label,
      flag: info.flag,
      code: info.code,
      accent: info.accent,
      count: counts[id] || 0,
      searchable: normalize(`${info.label} ${info.code} introduccion intro`),
    });
  });
  // Museum
  MUSEUM_INFO.forEach((info, i) => {
    const id = `MUSEUM-${i + 1}`;
    out.push({
      id,
      key: 'museum',
      sectionTitle: 'Museo FIFA',
      sectionSort: 1,
      number: i + 1,
      label: info.label,
      flag: info.flag,
      code: info.code,
      accent: info.accent,
      count: counts[id] || 0,
      searchable: normalize(`${info.label} ${info.code} museo fifa campeon`),
    });
  });
  // Teams (by groups, in album order)
  GROUPS.forEach((g, gi) => {
    TEAMS_BY_GROUP[g].forEach((t, ti) => {
      for (let i = 1; i <= 20; i++) {
        const id = `${t.code}-${i}`;
        const isPlayer = i !== 1 && i !== 13;
        const label =
          i === 1 ? 'Escudo' : i === 13 ? 'Equipo' : (names[id] || DEFAULT_NAMES[id] || '');
        out.push({
          id,
          key: 'team',
          team: t,
          group: g,
          sectionTitle: `Grupo ${g} · ${t.name}`,
          sectionSort: 100 + gi * 10 + ti,
          number: i,
          label,
          flag: t.flag,
          code: t.code,
          accent: t.color,
          isPlayer,
          count: counts[id] || 0,
          searchable: normalize(`${label} ${t.name} ${t.code} grupo ${g} #${i} ${i}`),
        });
      }
    });
  });
  // Coca-Cola
  COCA_INFO.forEach((info, i) => {
    const id = `COCA-${i + 1}`;
    out.push({
      id,
      key: 'coca',
      sectionTitle: 'Extras Coca-Cola',
      sectionSort: 1000,
      number: i + 1,
      label: info.label,
      flag: info.flag,
      code: info.code,
      accent: info.accent,
      count: counts[id] || 0,
      searchable: normalize(`${info.label} ${info.code} coca cola coca-cola`),
    });
  });
  return out;
}

function viewForStickerId(id) {
  if (id.startsWith('INTRO-')) return { type: 'simple', section: 'INTRO' };
  if (id.startsWith('MUSEUM-')) return { type: 'simple', section: 'MUSEUM' };
  if (id.startsWith('COCA-')) return { type: 'simple', section: 'COCA' };
  const code = id.split('-')[0];
  if (TEAM_BY_CODE[code]) return { type: 'team', code };
  return { type: 'home' };
}

// =========================
// MAIN APP
// =========================
export default function App() {
  const [counts, setCounts] = useState({});
  const [names, setNames] = useState({});
  const [view, setView] = useState({ type: 'home' });
  const [mode, setMode] = useState('add'); // 'add' or 'sub'
  const [loaded, setLoaded] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [editingId, setEditingId] = useState(null); // sticker id being renamed

  // Load on mount (localStorage, synchronous)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setCounts(JSON.parse(raw));
    } catch (e) {}
    try {
      const raw = localStorage.getItem(NAMES_KEY);
      if (raw) setNames(JSON.parse(raw));
    } catch (e) {}
    setLoaded(true);
  }, []);

  // Save counts on change
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(counts));
    } catch (e) {
      console.error('Save failed', e);
    }
  }, [counts, loaded]);

  // Save names on change
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(NAMES_KEY, JSON.stringify(names));
    } catch (e) {
      console.error('Save failed', e);
    }
  }, [names, loaded]);

  const updateName = useCallback((id, value) => {
    setNames(prev => {
      const updated = { ...prev };
      const trimmed = (value || '').trim();
      if (!trimmed) delete updated[id];
      else updated[id] = trimmed;
      return updated;
    });
  }, []);

  const updateSticker = useCallback((id, delta) => {
    setCounts(prev => {
      const cur = prev[id] || 0;
      const next = Math.max(0, cur + delta);
      const updated = { ...prev };
      if (next === 0) delete updated[id];
      else updated[id] = next;
      return updated;
    });
  }, []);

  const handleStickerTap = useCallback((id) => {
    updateSticker(id, mode === 'add' ? +1 : -1);
  }, [mode, updateSticker]);

  const resetAll = useCallback(() => {
    setCounts({});
    setNames({});
    setConfirmReset(false);
    if (history.state?.modal) history.back();
  }, []);

  // ---- History-API navigation ----
  // Each user-meaningful screen state is one history entry, so the OS / browser
  // back button (and the in-app "Volver") behave the same.
  const navigate = useCallback((newView) => {
    history.pushState({ view: newView, modal: null }, '');
    setView(newView);
    setEditingId(null);
    setConfirmReset(false);
  }, []);

  const replaceView = useCallback((newView) => {
    // Used for prev/next paging within the album: swaps the current entry
    // instead of growing the back stack, so back returns to where you came from.
    history.replaceState({ view: newView, modal: null }, '');
    setView(newView);
  }, []);

  const goBack = useCallback(() => {
    history.back();
  }, []);

  const openEditModal = useCallback((stickerId) => {
    history.pushState({ view, modal: { type: 'edit', stickerId } }, '');
    setEditingId(stickerId);
  }, [view]);

  const advanceEditModal = useCallback((stickerId) => {
    history.replaceState({ view, modal: { type: 'edit', stickerId } }, '');
    setEditingId(stickerId);
  }, [view]);

  const closeEditModal = useCallback(() => {
    if (history.state?.modal?.type === 'edit') history.back();
    else setEditingId(null);
  }, []);

  const openConfirmReset = useCallback(() => {
    history.pushState({ view, modal: { type: 'reset' } }, '');
    setConfirmReset(true);
  }, [view]);

  const closeConfirmReset = useCallback(() => {
    if (history.state?.modal?.type === 'reset') history.back();
    else setConfirmReset(false);
  }, []);

  // Initial replaceState + popstate listener
  useEffect(() => {
    if (!history.state) {
      history.replaceState({ view: { type: 'home' }, modal: null }, '');
    }
    const onPop = (e) => {
      const s = e.state || { view: { type: 'home' }, modal: null };
      setView(s.view || { type: 'home' });
      setEditingId(s.modal?.type === 'edit' ? s.modal.stickerId : null);
      setConfirmReset(s.modal?.type === 'reset');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Compute stats
  const stats = useMemo(() => {
    let unique = 0;
    let totalWithDupes = 0;
    let dupes = 0;
    Object.entries(counts).forEach(([id, c]) => {
      // Don't count Coca-Cola in the base 980
      if (id.startsWith('COCA-')) return;
      if (c > 0) {
        unique += 1;
        totalWithDupes += c;
        dupes += c - 1;
      }
    });
    return { unique, totalWithDupes, dupes, missing: TOTAL_BASE - unique };
  }, [counts]);

  const sectionStats = useMemo(() => {
    function countSection(prefix, total) {
      let c = 0;
      let dupes = 0;
      for (let i = 1; i <= total; i++) {
        const v = counts[`${prefix}-${i}`] || 0;
        if (v > 0) c++;
        if (v > 1) dupes += v - 1;
      }
      return { collected: c, total, dupes };
    }
    let teamsCollected = 0;
    let teamsDupes = 0;
    GROUPS.forEach(g => {
      TEAMS_BY_GROUP[g].forEach(t => {
        for (let i = 1; i <= 20; i++) {
          const v = counts[`${t.code}-${i}`] || 0;
          if (v > 0) teamsCollected++;
          if (v > 1) teamsDupes += v - 1;
        }
      });
    });
    return {
      intro: countSection('INTRO', INTRO_COUNT),
      museum: countSection('MUSEUM', MUSEUM_COUNT),
      coca: countSection('COCA', COCA_COUNT),
      teams: { collected: teamsCollected, total: 48 * 20, dupes: teamsDupes },
    };
  }, [counts]);

  function teamStats(code) {
    let collected = 0;
    let dupes = 0;
    for (let i = 1; i <= 20; i++) {
      const v = counts[`${code}-${i}`] || 0;
      if (v > 0) collected++;
      if (v > 1) dupes += v - 1;
    }
    return { collected, total: 20, dupes };
  }

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="text-stone-400 font-mono-special text-sm tracking-widest">CARGANDO ÁLBUM...</div>
      </div>
    );
  }

  const pct = Math.round((stats.unique / TOTAL_BASE) * 100);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 pb-20" style={{ fontFamily: "'DM Sans', sans-serif" }}>

      <div className="max-w-md mx-auto relative">
        {/* Decorative pattern background */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Ctext x='0' y='42' font-family='Helvetica,Arial,sans-serif' font-weight='900' font-size='38' fill='%23000'%3E26%3C/text%3E%3C/svg%3E")`,
          }}
        />

        <div className="relative">
          {view.type === 'home' && (
            <HomeView
              pct={pct}
              stats={stats}
              sectionStats={sectionStats}
              onNavigate={navigate}
              onResetClick={openConfirmReset}
            />
          )}
          {view.type === 'simple' && (
            <SimpleGridView
              section={view.section}
              counts={counts}
              mode={mode}
              setMode={setMode}
              onStickerTap={handleStickerTap}
              onBack={goBack}
              currentView={view}
              onReplaceView={replaceView}
            />
          )}
          {view.type === 'groups' && (
            <GroupsView
              counts={counts}
              teamStats={teamStats}
              onTeamSelect={(code) => navigate({ type: 'team', code })}
              onBack={goBack}
            />
          )}
          {view.type === 'team' && (
            <TeamView
              code={view.code}
              counts={counts}
              names={names}
              mode={mode}
              setMode={setMode}
              onStickerTap={handleStickerTap}
              onEditName={openEditModal}
              onBack={goBack}
              currentView={view}
              onReplaceView={replaceView}
            />
          )}
          {view.type === 'search' && (
            <SearchView
              counts={counts}
              names={names}
              mode={mode}
              setMode={setMode}
              onStickerTap={handleStickerTap}
              onResultNavigate={(id) => setView(viewForStickerId(id))}
              onBack={goBack}
            />
          )}
          {view.type === 'repes' && (
            <RepesView
              counts={counts}
              names={names}
              mode={mode}
              setMode={setMode}
              onStickerTap={handleStickerTap}
              onBack={goBack}
            />
          )}
        </div>

        {confirmReset && (
          <ConfirmReset onCancel={closeConfirmReset} onConfirm={resetAll} />
        )}

        {editingId && (
          <NameEditModal
            stickerId={editingId}
            currentName={resolveName(editingId, names)}
            onCancel={closeEditModal}
            onSave={(value) => {
              updateName(editingId, value);
              closeEditModal();
            }}
            onSaveAndNext={(value) => {
              updateName(editingId, value);
              // Advance to next player sticker on the same team if possible
              const m = editingId.match(/^([A-Z]{3})-(\d+)$/);
              if (m) {
                const code = m[1];
                let num = parseInt(m[2], 10);
                // Find next player slot, skipping 1 (escudo) and 13 (team photo)
                while (num < 20) {
                  num += 1;
                  if (num !== 13) {
                    advanceEditModal(`${code}-${num}`);
                    return;
                  }
                }
              }
              closeEditModal();
            }}
          />
        )}
      </div>
    </div>
  );
}


// =========================
// HOME VIEW
// =========================
function HomeView({ pct, stats, sectionStats, onNavigate, onResetClick }) {
  return (
    <div className="px-4 pt-6">
      {/* Top brand */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="font-mono-special text-[10px] tracking-[0.25em] text-stone-500">PANINI · OFICIAL</div>
          <div className="font-display text-3xl mt-1 leading-none">ÁLBUM <span className="text-rose-600">26</span></div>
          <div className="text-xs text-stone-500 mt-1">Mundial · USA · México · Canadá</div>
        </div>
        <button
          onClick={onResetClick}
          className="text-stone-400 hover:text-stone-600 p-2"
          aria-label="Reiniciar"
        >
          <RotateCcw size={18} />
        </button>
      </div>

      {/* Big progress card */}
      <div className="bg-white rounded-3xl panini-shadow p-6 mb-4 relative overflow-hidden">
        <div
          className="absolute -right-8 -top-8 font-display text-[180px] text-rose-600/[0.06] leading-none select-none pointer-events-none"
        >
          26
        </div>
        <div className="relative">
          <div className="font-mono-special text-[10px] tracking-[0.25em] text-stone-500">PROGRESO</div>
          <div className="flex items-baseline gap-2 mt-2">
            <div className="font-display text-7xl leading-none text-stone-900">{pct}</div>
            <div className="font-display text-3xl text-stone-400">%</div>
          </div>
          <div className="font-mono-special text-sm text-stone-600 mt-1">
            {stats.unique} <span className="text-stone-400">/ {TOTAL_BASE}</span>
          </div>

          {/* Progress bar */}
          <div className="h-2 bg-stone-100 rounded-full mt-5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-rose-600 to-amber-500 rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* 3 stat cells */}
          <div className="grid grid-cols-3 gap-2 mt-5">
            <StatCell icon={<Check size={14} />} value={stats.unique} label="pegadas" tone="emerald" />
            <StatCell icon={<Hash size={14} />} value={stats.missing} label="faltan" tone="rose" />
            <StatCell icon={<Flame size={14} />} value={stats.dupes} label="repes" tone="amber" />
          </div>
        </div>
      </div>

      {/* Quick actions: Buscar & Mis repes */}
      <div className="grid grid-cols-2 gap-2 mt-3">
        <button
          onClick={() => onNavigate({ type: 'search' })}
          className="bg-white rounded-2xl panini-shadow p-3 flex items-center gap-2.5 active:scale-[0.99] transition-transform text-left"
        >
          <div className="w-9 h-9 rounded-lg bg-stone-900 flex items-center justify-center flex-shrink-0">
            <Search size={16} className="text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-sm leading-tight">Buscar</div>
            <div className="text-[10px] text-stone-500 leading-tight mt-0.5">por nombre o equipo</div>
          </div>
        </button>
        <button
          onClick={() => onNavigate({ type: 'repes' })}
          className="bg-white rounded-2xl panini-shadow p-3 flex items-center gap-2.5 active:scale-[0.99] transition-transform text-left"
        >
          <div className="w-9 h-9 rounded-lg bg-amber-400 flex items-center justify-center flex-shrink-0">
            <Flame size={16} className="text-stone-900" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-sm leading-tight">
              Mis repes{stats.dupes > 0 ? <span className="text-stone-400 font-mono-special font-normal"> · {stats.dupes}</span> : null}
            </div>
            <div className="text-[10px] text-stone-500 leading-tight mt-0.5">
              {stats.dupes > 0 ? 'para intercambiar' : 'todavía nada'}
            </div>
          </div>
        </button>
      </div>

      {/* Sections */}
      <div className="font-mono-special text-[10px] tracking-[0.25em] text-stone-500 mt-6 mb-3 px-1">
        SECCIONES DEL ÁLBUM
      </div>

      <div className="space-y-2">
        <SectionCard
          title="Introducción"
          subtitle="Trofeo, mascota, estadios"
          collected={sectionStats.intro.collected}
          total={sectionStats.intro.total}
          icon={<Sparkles size={18} />}
          accent="#1E40AF"
          onClick={() => onNavigate({ type: 'simple', section: 'INTRO' })}
        />
        <SectionCard
          title="Equipos"
          subtitle="48 selecciones · 12 grupos"
          collected={sectionStats.teams.collected}
          total={sectionStats.teams.total}
          icon={<Users size={18} />}
          accent="#E11D48"
          onClick={() => onNavigate({ type: 'groups' })}
          big
        />
        <SectionCard
          title="Museo FIFA"
          subtitle="Campeones de la historia"
          collected={sectionStats.museum.collected}
          total={sectionStats.museum.total}
          icon={<Trophy size={18} />}
          accent="#F59E0B"
          onClick={() => onNavigate({ type: 'simple', section: 'MUSEUM' })}
        />
        <SectionCard
          title="Extras Coca-Cola"
          subtitle="No cuentan en el 980"
          collected={sectionStats.coca.collected}
          total={sectionStats.coca.total}
          icon={<Star size={18} />}
          accent="#DC2626"
          onClick={() => onNavigate({ type: 'simple', section: 'COCA' })}
          extra
        />
      </div>

      <div className="text-center text-[11px] text-stone-400 mt-8 font-mono-special tracking-widest">
        SE GUARDA AUTOMÁTICAMENTE
      </div>
    </div>
  );
}

function StatCell({ icon, value, label, tone }) {
  const toneMap = {
    emerald: 'bg-emerald-50 text-emerald-700',
    rose: 'bg-rose-50 text-rose-700',
    amber: 'bg-amber-50 text-amber-700',
  };
  return (
    <div className={`rounded-xl px-2 py-3 ${toneMap[tone]}`}>
      <div className="flex items-center gap-1 opacity-70">
        {icon}
        <span className="text-[10px] uppercase tracking-wider font-medium">{label}</span>
      </div>
      <div className="font-mono-special text-xl font-bold mt-1">{value}</div>
    </div>
  );
}

function SectionCard({ title, subtitle, collected, total, icon, accent, onClick, big, extra }) {
  const pct = total > 0 ? Math.round((collected / total) * 100) : 0;
  const done = collected === total && total > 0;
  return (
    <button
      onClick={onClick}
      className="w-full bg-white rounded-2xl panini-shadow p-4 text-left active:scale-[0.99] transition-transform relative overflow-hidden"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div
            className="rounded-xl w-10 h-10 flex items-center justify-center text-white flex-shrink-0"
            style={{ backgroundColor: accent }}
          >
            {icon}
          </div>
          <div className="min-w-0">
            <div className="font-display text-lg leading-tight flex items-center gap-2">
              {title}
              {done && <Check size={16} className="text-emerald-600" strokeWidth={3} />}
              {extra && (
                <span className="text-[9px] font-mono-special tracking-widest bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                  BONUS
                </span>
              )}
            </div>
            <div className="text-xs text-stone-500 mt-0.5 truncate">{subtitle}</div>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="font-mono-special text-base font-bold">{collected}<span className="text-stone-400">/{total}</span></div>
          <div className="text-[10px] text-stone-400 font-mono-special">{pct}%</div>
        </div>
      </div>
      {/* Bar */}
      <div className="h-1.5 bg-stone-100 rounded-full mt-3 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: accent }}
        />
      </div>
    </button>
  );
}

// =========================
// SIMPLE GRID VIEW (Intro / Museum / Coca)
// =========================
function SimpleGridView({ section, counts, mode, setMode, onStickerTap, onBack, currentView, onReplaceView }) {
  const config = {
    INTRO:  { title: 'Introducción',     subtitle: 'Logo, emblemas, mascotas, sedes', accent: '#1E40AF', data: INTRO_INFO },
    MUSEUM: { title: 'Museo FIFA',       subtitle: 'Campeones de la historia',       accent: '#F59E0B', data: MUSEUM_INFO },
    COCA:   { title: 'Extras Coca-Cola', subtitle: '12 stickers exclusivos',         accent: '#DC2626', data: COCA_INFO },
  }[section];

  return (
    <div className="px-4 pt-4">
      <Header onBack={onBack} title={config.title} subtitle={config.subtitle} accent={config.accent} />
      <ModeToggle mode={mode} setMode={setMode} />

      <div className="mt-4 grid grid-cols-4 gap-x-2 gap-y-3">
        {config.data.map((info, i) => {
          const idx = i + 1;
          const id = `${section}-${idx}`;
          const count = counts[id] || 0;
          return (
            <StickerCell
              key={id}
              number={idx}
              count={count}
              accent={info.accent}
              flag={info.flag}
              code={info.code}
              fixedLabel={info.label}
              isPlayer={false}
              onTap={() => onStickerTap(id)}
              onEditName={() => {}}
            />
          );
        })}
      </div>

      <PageNav currentView={currentView} onReplaceView={onReplaceView} />
      <Legend />
    </div>
  );
}

// =========================
// GROUPS VIEW (12 groups, all teams listed)
// =========================
function GroupsView({ counts, teamStats, onTeamSelect, onBack }) {
  return (
    <div className="px-4 pt-4">
      <Header onBack={onBack} title="Equipos" subtitle="48 selecciones · 12 grupos" accent="#E11D48" />

      <div className="mt-4 space-y-5">
        {GROUPS.map(g => {
          const teams = TEAMS_BY_GROUP[g];
          const groupCollected = teams.reduce((s, t) => s + teamStats(t.code).collected, 0);
          const groupTotal = teams.length * 20;
          return (
            <div key={g}>
              <div className="flex items-center justify-between px-1 mb-2">
                <div className="flex items-center gap-2">
                  <div className="font-display text-2xl text-stone-900 leading-none">GRUPO {g}</div>
                </div>
                <div className="font-mono-special text-xs text-stone-500">
                  {groupCollected}<span className="text-stone-400">/{groupTotal}</span>
                </div>
              </div>
              <div className="space-y-2">
                {teams.map(t => {
                  const ts = teamStats(t.code);
                  const pct = Math.round((ts.collected / ts.total) * 100);
                  const done = ts.collected === ts.total;
                  return (
                    <button
                      key={t.code}
                      onClick={() => onTeamSelect(t.code)}
                      className="w-full bg-white rounded-2xl panini-shadow p-3 text-left active:scale-[0.99] transition-transform"
                    >
                      <div className="flex items-center gap-3">
                        {/* Flag tile with team color border */}
                        <div
                          className="rounded-lg w-12 h-12 flex flex-col items-center justify-center flex-shrink-0 relative overflow-hidden"
                          style={{ backgroundColor: t.color }}
                        >
                          <div className="text-2xl leading-none">{t.flag}</div>
                          <div
                            className="font-mono-special text-[8px] tracking-widest mt-0.5 font-bold"
                            style={{ color: textOn(t.color), opacity: 0.85 }}
                          >
                            {t.code}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-display text-base leading-tight truncate">{t.name}</div>
                            <div className="font-mono-special text-sm font-bold flex-shrink-0">
                              {ts.collected}<span className="text-stone-400">/20</span>
                            </div>
                          </div>
                          <div className="h-1.5 bg-stone-100 rounded-full mt-1.5 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{ width: `${pct}%`, backgroundColor: t.color }}
                            />
                          </div>
                          {(ts.dupes > 0 || done) && (
                            <div className="flex items-center gap-2 mt-1.5">
                              {done && (
                                <div className="text-[10px] font-mono-special tracking-wider bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
                                  COMPLETO ✓
                                </div>
                              )}
                              {ts.dupes > 0 && (
                                <div className="text-[10px] font-mono-special tracking-wider bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                                  {ts.dupes} {ts.dupes === 1 ? 'repe' : 'repes'}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =========================
// TEAM VIEW (20 stickers)
// =========================
function TeamView({ code, counts, names, mode, setMode, onStickerTap, onEditName, onBack, currentView, onReplaceView }) {
  const team = TEAM_BY_CODE[code];
  let collected = 0;
  let dupes = 0;
  for (let i = 1; i <= 20; i++) {
    const v = counts[`${code}-${i}`] || 0;
    if (v > 0) collected++;
    if (v > 1) dupes += v - 1;
  }
  const pct = Math.round((collected / 20) * 100);
  const onColor = textOn(team.color);
  const isLight = isLightColor(team.color);

  // List of "repes" sticker numbers for trade panel
  const repesList = [];
  for (let i = 1; i <= 20; i++) {
    const v = counts[`${code}-${i}`] || 0;
    if (v > 1) repesList.push({ n: i, count: v - 1, name: resolveName(`${code}-${i}`, names) });
  }

  return (
    <div className="px-4 pt-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-stone-500 active:text-stone-900 mb-3 -ml-1"
      >
        <ChevronLeft size={20} />
        <span className="text-sm">Equipos</span>
      </button>

      {/* Album-style team header: WE ARE [COUNTRY] */}
      <div
        className="rounded-3xl panini-shadow relative overflow-hidden"
        style={{ backgroundColor: team.color, color: onColor }}
      >
        {/* Big code watermark */}
        <div
          className="absolute -right-4 -top-2 font-display text-[120px] leading-none select-none pointer-events-none"
          style={{ color: isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.10)' }}
        >
          {team.code}
        </div>

        <div className="relative p-5">
          <div className="font-mono-special text-[10px] tracking-[0.3em] opacity-70">
            GRUPO {team.group}
          </div>
          <div
            className="font-display text-xs tracking-[0.3em] opacity-80 mt-2"
          >
            WE ARE
          </div>
          <div className="flex items-center gap-3 mt-1">
            <div className="font-display text-3xl leading-none uppercase">{team.name}</div>
            <span className="text-3xl leading-none">{team.flag}</span>
          </div>

          <div className="flex items-baseline gap-2 mt-4">
            <div className="font-display text-4xl">{collected}</div>
            <div className="font-display text-2xl opacity-60">/ 20</div>
            <div className="font-mono-special text-sm opacity-70 ml-2">· {pct}%</div>
          </div>
          <div
            className="h-2 rounded-full mt-2 overflow-hidden"
            style={{ backgroundColor: isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.20)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                backgroundColor: isLight ? '#0F0F12' : '#FFFFFF',
              }}
            />
          </div>
        </div>
      </div>

      <ModeToggle mode={mode} setMode={setMode} />

      {/* Sticker grid — album-style 4 columns with names underneath */}
      <div className="mt-4 grid grid-cols-4 gap-x-2 gap-y-3">
        {Array.from({ length: 20 }).map((_, i) => {
          const idx = i + 1;
          const id = `${code}-${idx}`;
          const count = counts[id] || 0;
          const isPlayer = idx !== 1 && idx !== 13;
          const fixedLabel = idx === 1 ? 'Escudo' : idx === 13 ? 'Equipo' : null;
          const playerName = resolveName(id, names);
          const isCustomName = !!names[id];

          return (
            <StickerCell
              key={id}
              number={idx}
              count={count}
              accent={team.color}
              flag={team.flag}
              code={team.code}
              fixedLabel={fixedLabel}
              playerName={playerName}
              isCustomName={isCustomName}
              isPlayer={isPlayer}
              onTap={() => onStickerTap(id)}
              onEditName={() => onEditName(id)}
            />
          );
        })}
      </div>

      {repesList.length > 0 && (
        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Flame size={14} className="text-amber-700" />
            <div className="font-mono-special text-[10px] tracking-[0.2em] text-amber-800">
              REPES PARA INTERCAMBIAR
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {repesList.map(r => (
              <div
                key={r.n}
                className="bg-white rounded-lg px-2 py-1 text-xs font-mono-special font-bold border border-amber-300"
              >
                #{r.n}
                {r.name && <span className="text-stone-600 font-normal ml-1">· {r.name}</span>}
                {r.count > 1 && <span className="text-amber-700 ml-1">×{r.count}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <PageNav currentView={currentView} onReplaceView={onReplaceView} />
      <Legend hasNames />
    </div>
  );
}


// =========================
// STICKER CELL — figurita-style when collected
// =========================
function StickerCell({ number, count, accent, flag, code, fixedLabel, playerName, isCustomName, isPlayer, onTap, onEditName }) {
  const collected = count > 0;
  const dupes = Math.max(0, count - 1);
  const onColor = collected ? textOn(accent) : '#A8A29E';
  const isLight = collected ? isLightColor(accent) : false;

  // Deterministic small rotation so each sticker looks hand-placed (-1.6 to +1.6 deg)
  const rot = collected ? (((number * 37) % 7) - 3) * 0.55 : 0;

  // The big "26" watermark inside the sticker uses an inverted alpha based on bg
  const watermarkColor = isLight ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.18)';
  const subColor = isLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.75)';

  return (
    <div className="flex flex-col">
      {/* Sticker square */}
      <button
        onClick={onTap}
        className="relative aspect-square sticker-tap"
        style={{ transform: `rotate(${rot}deg)` }}
      >
        {/* The "page slot" behind the sticker (visible when empty) */}
        {!collected && (
          <div
            className="absolute inset-0 rounded-xl flex items-center justify-center overflow-hidden"
            style={{ backgroundColor: '#F5F5F4', border: '2px dashed #D6D3D1' }}
          >
            <div
              className="absolute top-1.5 left-1.5 font-mono-special text-[9px] font-bold"
              style={{ color: '#A8A29E' }}
            >
              {String(number).padStart(2, '0')}
            </div>
            <div className="font-display text-3xl" style={{ color: '#E7E5E4' }}>
              26
            </div>
          </div>
        )}

        {/* The actual figurita (visible when collected) */}
        {collected && (
          <div
            className="absolute inset-0 rounded-xl overflow-hidden"
            style={{
              backgroundColor: accent,
              boxShadow:
                '0 2px 5px -1px rgba(0,0,0,0.28), 0 1px 2px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.20)',
            }}
          >
            {/* Big "26" watermark */}
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
              aria-hidden="true"
            >
              <span
                className="font-display"
                style={{
                  lineHeight: 1,
                  letterSpacing: '-0.06em',
                  color: watermarkColor,
                  fontVariantNumeric: 'tabular-nums',
                  transform: 'translateY(-2%)',
                  fontSize: '4.2rem',
                }}
              >
                26
              </span>
            </div>

            {/* Top-left number */}
            <div
              className="absolute top-1 left-1.5 font-mono-special text-[9px] font-bold tracking-tight"
              style={{ color: onColor, opacity: 0.92 }}
            >
              {String(number).padStart(2, '0')}
            </div>

            {/* Top-right flag (only if provided) */}
            {flag && (
              <div className="absolute top-0.5 right-1 text-[14px] leading-none">
                {flag}
              </div>
            )}

            {/* Bottom strip: FIFA code or category label */}
            <div
              className="absolute bottom-0 left-0 right-0 px-1.5 py-1 flex items-center justify-center"
              style={{
                background:
                  isLight ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.18)',
              }}
            >
              <span
                className="font-display text-[9px] tracking-[0.15em]"
                style={{ color: subColor }}
              >
                {fixedLabel === 'Escudo'
                  ? 'ESCUDO'
                  : fixedLabel === 'Equipo'
                  ? 'EQUIPO'
                  : code}
              </span>
            </div>

            {/* Diagonal shine overlay */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 38%, rgba(0,0,0,0.06) 100%)',
              }}
            />
          </div>
        )}

        {/* Dupe badge — outside so it isn't clipped */}
        {dupes > 0 && (
          <div className="absolute -top-1 -right-1 z-10 bg-amber-400 text-stone-900 text-[10px] font-bold rounded-full min-w-[20px] h-[20px] px-1 flex items-center justify-center font-mono-special border-2 border-white shadow-sm">
            +{dupes}
          </div>
        )}
      </button>

      {/* Name strip below the figurita */}
      {fixedLabel ? (
        <div className="mt-1.5 text-center text-[10px] font-mono-special tracking-wider text-stone-500 uppercase truncate">
          {fixedLabel}
        </div>
      ) : (
        <button
          onClick={onEditName}
          className="mt-1.5 text-center min-h-[16px] active:bg-stone-100 rounded transition-colors px-0.5"
        >
          {playerName ? (
            <div
              className={`text-[11px] truncate leading-tight ${
                isCustomName ? 'font-semibold text-stone-900' : 'font-medium text-stone-700'
              }`}
            >
              {playerName}
            </div>
          ) : (
            <div className="text-[10px] text-stone-400 truncate flex items-center justify-center gap-0.5">
              <Pencil size={9} />
              <span>nombre</span>
            </div>
          )}
        </button>
      )}
    </div>
  );
}

// =========================
// NAME EDIT MODAL
// =========================
function NameEditModal({ stickerId, currentName, onCancel, onSave, onSaveAndNext }) {
  const [value, setValue] = useState(currentName);
  const inputRef = useRef(null);

  // Parse stickerId for display
  const m = stickerId.match(/^([A-Z]{3})-(\d+)$/);
  const team = m ? TEAM_BY_CODE[m[1]] : null;
  const num = m ? parseInt(m[2], 10) : 0;
  const isLastPlayer = num === 20;

  useEffect(() => {
    setValue(currentName);
    const t = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 80);
    return () => clearTimeout(t);
  }, [stickerId, currentName]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (isLastPlayer) onSave(value);
      else onSaveAndNext(value);
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  if (!team) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-3xl p-5 panini-shadow max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-xl">{team.flag}</span>
            <div className="font-display text-base">{team.name}</div>
          </div>
          <button
            onClick={onCancel}
            className="text-stone-400 active:text-stone-700 -mr-1 p-1"
          >
            <X size={18} />
          </button>
        </div>
        <div className="font-mono-special text-[10px] tracking-[0.2em] text-stone-500">
          FIGURITA #{String(num).padStart(2, '0')}
        </div>

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Nombre del jugador"
          className="mt-4 w-full px-4 py-3 bg-stone-100 rounded-xl text-base font-medium outline-none focus:bg-stone-50 focus:ring-2 focus:ring-stone-300"
          autoComplete="off"
          autoCapitalize="words"
        />

        <div className="flex gap-2 mt-4">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl bg-stone-100 text-stone-900 font-medium active:bg-stone-200"
          >
            Cancelar
          </button>
          {!isLastPlayer ? (
            <button
              onClick={() => onSaveAndNext(value)}
              className="flex-1 py-3 rounded-xl bg-stone-900 text-white font-medium active:bg-stone-700 flex items-center justify-center gap-1.5"
            >
              Guardar
              <ArrowRight size={16} />
            </button>
          ) : (
            <button
              onClick={() => onSave(value)}
              className="flex-1 py-3 rounded-xl bg-stone-900 text-white font-medium active:bg-stone-700"
            >
              Guardar
            </button>
          )}
        </div>
        <div className="text-[11px] text-stone-400 text-center mt-2 font-mono-special">
          {isLastPlayer ? 'ÚLTIMA FIGURITA' : 'GUARDA Y AVANZA AL SIGUIENTE'}
        </div>
      </div>
    </div>
  );
}


// =========================
// RESULT ROW (used by Search and Repes)
// =========================
function ResultRow({ s, onTap }) {
  const fg = textOn(s.accent);
  return (
    <button
      onClick={() => onTap(s.id)}
      className="w-full bg-white rounded-xl panini-shadow p-2.5 flex items-center gap-2.5 active:scale-[0.99] transition-transform"
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 relative overflow-hidden"
        style={{ backgroundColor: s.accent }}
      >
        {s.flag ? (
          <span className="text-lg leading-none">{s.flag}</span>
        ) : (
          <span className="font-display text-[9px] tracking-wider" style={{ color: fg }}>
            {s.code}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0 text-left">
        <div className="font-medium text-[13px] leading-tight truncate text-stone-900">
          {s.label || <span className="text-stone-400">(sin nombre)</span>}
        </div>
        <div className="text-[10px] text-stone-500 truncate font-mono-special tracking-wider mt-0.5">
          {s.sectionTitle} · #{String(s.number).padStart(2, '0')}
        </div>
      </div>
      <div className="flex-shrink-0">
        {s.count === 0 ? (
          <span className="text-[10px] text-stone-400 font-mono-special tracking-wider">FALTA</span>
        ) : s.count === 1 ? (
          <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center">
            <Check className="text-emerald-700" size={14} strokeWidth={3} />
          </div>
        ) : (
          <div className="bg-amber-400 text-stone-900 rounded-full px-2 py-1 text-xs font-mono-special font-bold leading-none">
            ×{s.count}
          </div>
        )}
      </div>
    </button>
  );
}

// =========================
// SEARCH VIEW
// =========================
function SearchView({ counts, names, mode, setMode, onStickerTap, onResultNavigate, onBack }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  const all = useMemo(() => allStickers(counts, names), [counts, names]);

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return [];
    return all.filter(s => s.searchable.includes(q)).slice(0, 200);
  }, [all, query]);

  const isEmpty = !query.trim();

  return (
    <div className="px-4 pt-4 pb-8">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-stone-500 active:text-stone-900 mb-3 -ml-1"
      >
        <ChevronLeft size={20} />
        <span className="text-sm">Inicio</span>
      </button>

      {/* Search input */}
      <div className="bg-white rounded-2xl panini-shadow p-2 flex items-center gap-2">
        <Search size={18} className="text-stone-400 ml-2 flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nombre, país, código FIFA, número..."
          className="flex-1 bg-transparent outline-none text-base py-2 min-w-0"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        {query && (
          <button
            onClick={() => { setQuery(''); inputRef.current?.focus(); }}
            className="text-stone-400 active:text-stone-700 p-1.5 mr-1 flex-shrink-0"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <ModeToggle mode={mode} setMode={setMode} />

      {isEmpty ? (
        <div className="mt-6 px-1 text-stone-500">
          <div className="font-mono-special text-[10px] tracking-widest text-stone-400 mb-3">
            CÓMO BUSCAR
          </div>
          <div className="space-y-2 text-[13px]">
            <div>• Por <span className="font-medium text-stone-900">jugador</span>: ej. <span className="font-mono-special bg-stone-100 px-1.5 py-0.5 rounded">Messi</span>, <span className="font-mono-special bg-stone-100 px-1.5 py-0.5 rounded">Yamal</span></div>
            <div>• Por <span className="font-medium text-stone-900">país</span>: ej. <span className="font-mono-special bg-stone-100 px-1.5 py-0.5 rounded">Argentina</span>, <span className="font-mono-special bg-stone-100 px-1.5 py-0.5 rounded">Brasil</span></div>
            <div>• Por <span className="font-medium text-stone-900">código FIFA</span>: ej. <span className="font-mono-special bg-stone-100 px-1.5 py-0.5 rounded">ARG</span>, <span className="font-mono-special bg-stone-100 px-1.5 py-0.5 rounded">ESP</span></div>
            <div>• Por <span className="font-medium text-stone-900">número</span>: ej. <span className="font-mono-special bg-stone-100 px-1.5 py-0.5 rounded">17</span></div>
            <div>• Por <span className="font-medium text-stone-900">año</span> (Museo): ej. <span className="font-mono-special bg-stone-100 px-1.5 py-0.5 rounded">1986</span>, <span className="font-mono-special bg-stone-100 px-1.5 py-0.5 rounded">2022</span></div>
          </div>
        </div>
      ) : results.length === 0 ? (
        <div className="mt-8 text-center text-stone-500">
          <div className="text-4xl mb-2">😕</div>
          <div className="font-display text-lg">Sin resultados</div>
          <div className="text-sm text-stone-400 mt-1">Probá con otro nombre, país o código</div>
        </div>
      ) : (
        <>
          <div className="font-mono-special text-[10px] tracking-widest text-stone-400 mt-4 mb-2 px-1">
            {results.length} {results.length === 1 ? 'RESULTADO' : 'RESULTADOS'}
          </div>
          <div className="space-y-1.5">
            {results.map(s => {
              // We support two interactions: tap = mark in current mode, swipe / long path is navigate
              // For simplicity: tap = increment/decrement based on mode. To navigate to the team page,
              // we offer a small "→" affordance to the right of the count (kept simple for v1: tap row toggles).
              return <ResultRow key={s.id} s={s} onTap={onStickerTap} />;
            })}
          </div>

          <div className="text-center text-[11px] text-stone-400 mt-6 font-mono-special tracking-widest">
            TOCÁ UN RESULTADO PARA {mode === 'add' ? 'SUMAR' : 'RESTAR'}
          </div>
        </>
      )}
    </div>
  );
}

// =========================
// REPES VIEW
// =========================
function RepesView({ counts, names, mode, setMode, onStickerTap, onBack }) {
  const all = useMemo(() => allStickers(counts, names), [counts, names]);

  const repes = useMemo(() => all.filter(s => s.count > 1), [all]);
  const totalRepes = useMemo(() => repes.reduce((acc, s) => acc + (s.count - 1), 0), [repes]);

  // Group by sectionTitle, preserving sectionSort order
  const groups = useMemo(() => {
    const m = new Map();
    for (const s of repes) {
      if (!m.has(s.sectionTitle)) {
        m.set(s.sectionTitle, { title: s.sectionTitle, sort: s.sectionSort, items: [] });
      }
      m.get(s.sectionTitle).items.push(s);
    }
    const arr = Array.from(m.values());
    arr.sort((a, b) => a.sort - b.sort);
    arr.forEach(g => g.items.sort((a, b) => a.number - b.number));
    return arr;
  }, [repes]);

  return (
    <div className="px-4 pt-4 pb-8">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-stone-500 active:text-stone-900 mb-3 -ml-1"
      >
        <ChevronLeft size={20} />
        <span className="text-sm">Inicio</span>
      </button>

      <div className="bg-white rounded-2xl panini-shadow p-4 relative overflow-hidden">
        <div className="absolute -right-3 -top-3 text-7xl opacity-[0.08] select-none pointer-events-none">
          🔥
        </div>
        <div className="relative">
          <div className="font-mono-special text-[10px] tracking-[0.25em] text-amber-700">
            PARA INTERCAMBIAR
          </div>
          <div className="font-display text-2xl mt-1">Mis repes</div>
          <div className="flex items-baseline gap-2 mt-2">
            <div className="font-display text-4xl">{totalRepes}</div>
            <div className="text-sm text-stone-500">
              {totalRepes === 1 ? 'figurita repetida' : 'figuritas repetidas'}
            </div>
          </div>
          {repes.length > 0 && (
            <div className="text-xs text-stone-500 mt-1">
              en {repes.length} {repes.length === 1 ? 'figurita distinta' : 'figuritas distintas'}
            </div>
          )}
        </div>
      </div>

      {repes.length === 0 ? (
        <div className="mt-10 text-center text-stone-500 px-6">
          <div className="text-5xl mb-3">📭</div>
          <div className="font-display text-lg">Todavía no tenés repes</div>
          <div className="text-sm text-stone-400 mt-2 leading-relaxed">
            Cuando tengas una figurita más de una vez, va a aparecer acá para que la tengas a mano cuando intercambies.
          </div>
        </div>
      ) : (
        <>
          <ModeToggle mode={mode} setMode={setMode} />

          <div className="mt-4 space-y-5">
            {groups.map(g => (
              <div key={g.title}>
                <div className="flex items-center justify-between px-1 mb-2">
                  <div className="font-display text-sm uppercase tracking-wide text-stone-700">
                    {g.title}
                  </div>
                  <div className="font-mono-special text-[10px] text-stone-400">
                    {g.items.reduce((acc, s) => acc + (s.count - 1), 0)} repe{g.items.reduce((acc, s) => acc + (s.count - 1), 0) === 1 ? '' : 's'}
                  </div>
                </div>
                <div className="space-y-1.5">
                  {g.items.map(s => (
                    <ResultRow key={s.id} s={s} onTap={onStickerTap} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="text-center text-[11px] text-stone-400 mt-6 font-mono-special tracking-widest">
            TOCÁ PARA {mode === 'add' ? 'SUMAR' : 'RESTAR'} · CAMBIÁ EL MODO ARRIBA
          </div>
        </>
      )}
    </div>
  );
}


// =========================
// PAGE NAV (prev/next page in album order, used in TeamView and SimpleGridView)
// =========================
function PageNav({ currentView, onReplaceView }) {
  const prev = pageNeighbor(currentView, -1);
  const next = pageNeighbor(currentView, +1);
  if (!prev || !next) return null;
  return (
    <div className="mt-7 grid grid-cols-2 gap-2">
      <button
        onClick={() => onReplaceView(viewFromPage(prev))}
        className="bg-white rounded-2xl panini-shadow px-3 py-2.5 flex items-center gap-2 active:scale-[0.99] transition-transform text-left min-w-0"
      >
        <ChevronLeft size={18} className="text-stone-500 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-mono-special text-[9px] tracking-[0.2em] text-stone-400">ANTERIOR</div>
          <div className="font-display text-sm leading-tight truncate">{prev.label}</div>
          <div className="text-[10px] text-stone-500 truncate">{prev.subtitle}</div>
        </div>
      </button>
      <button
        onClick={() => onReplaceView(viewFromPage(next))}
        className="bg-white rounded-2xl panini-shadow px-3 py-2.5 flex items-center gap-2 active:scale-[0.99] transition-transform text-left min-w-0"
      >
        <div className="min-w-0 flex-1 text-right">
          <div className="font-mono-special text-[9px] tracking-[0.2em] text-stone-400">SIGUIENTE</div>
          <div className="font-display text-sm leading-tight truncate">{next.label}</div>
          <div className="text-[10px] text-stone-500 truncate">{next.subtitle}</div>
        </div>
        <ChevronRight size={18} className="text-stone-500 flex-shrink-0" />
      </button>
    </div>
  );
}

// =========================
// SHARED UI
// =========================
function Header({ onBack, title, subtitle, accent }) {
  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-stone-500 active:text-stone-900 mb-3 -ml-1"
      >
        <ChevronLeft size={20} />
        <span className="text-sm">Volver</span>
      </button>
      <div className="bg-white rounded-2xl panini-shadow p-4 relative overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: accent }} />
        <div className="pl-2">
          <div className="font-display text-2xl leading-tight">{title}</div>
          <div className="text-xs text-stone-500 mt-0.5">{subtitle}</div>
        </div>
      </div>
    </div>
  );
}

function ModeToggle({ mode, setMode }) {
  return (
    <div className="flex items-center gap-2 mt-4 bg-white rounded-2xl p-1 panini-shadow">
      <button
        onClick={() => setMode('add')}
        className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
          mode === 'add'
            ? 'bg-stone-900 text-white'
            : 'text-stone-600 hover:text-stone-900'
        }`}
      >
        <Plus size={16} strokeWidth={2.5} />
        Sumar
      </button>
      <button
        onClick={() => setMode('sub')}
        className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
          mode === 'sub'
            ? 'bg-stone-900 text-white'
            : 'text-stone-600 hover:text-stone-900'
        }`}
      >
        <Minus size={16} strokeWidth={2.5} />
        Restar
      </button>
    </div>
  );
}

function Legend({ hasNames }) {
  return (
    <div className="mt-6 text-[11px] text-stone-500 space-y-1.5 px-1">
      <div className="font-mono-special tracking-widest text-[10px] text-stone-400 mb-2">CÓMO SE USA</div>
      <div>• Tocá una figurita para marcarla / sumarle</div>
      <div>• Cambiá a <span className="font-medium">Restar</span> para quitar repes</div>
      <div>• El número amarillo indica cuántas repes tenés</div>
      {hasNames && <div>• Tocá <span className="font-medium">"nombre"</span> debajo del jugador para escribir cómo se llama</div>}
    </div>
  );
}

function ConfirmReset({ onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-3xl p-6 panini-shadow max-w-md w-full">
        <div className="font-display text-2xl mb-2">¿Borrar todo?</div>
        <div className="text-sm text-stone-600 mb-5">
          Vas a perder todo tu progreso del álbum. Esta acción no se puede deshacer.
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl bg-stone-100 text-stone-900 font-medium active:bg-stone-200"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-xl bg-rose-600 text-white font-medium active:bg-rose-700"
          >
            Borrar todo
          </button>
        </div>
      </div>
    </div>
  );
}
